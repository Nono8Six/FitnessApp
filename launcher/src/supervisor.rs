use crate::process::{hidden, ProcessJob};
use serde::{Deserialize, Serialize};
use std::collections::VecDeque;
use std::io::{BufRead, BufReader, Read, Write};
use std::net::{SocketAddr, TcpStream};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::{mpsc, Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

pub const URL: &str = "http://127.0.0.1:4330";
const LOG_LIMIT: usize = 200;
const INTERFACE_ERROR: &str =
    "L'interface Fitness n'est pas construite. Relancer depuis le projet.";

#[derive(Clone, Deserialize, Serialize)]
pub struct Options {
    pub simulation: bool,
    pub network: bool,
}

#[derive(Clone, Serialize)]
pub struct LogLine {
    pub id: u64,
    pub time: u64,
    pub source: String,
    pub text: String,
}

#[derive(Clone, Serialize)]
pub struct Snapshot {
    pub phase: String,
    pub owned: bool,
    pub can_stop: bool,
    pub pid: Option<u32>,
    pub url: String,
    pub mode: Option<String>,
    pub network: Option<bool>,
    pub phone_urls: Vec<String>,
    pub started_at: Option<u64>,
    pub error: Option<String>,
    pub logs: VecDeque<LogLine>,
}

impl Default for Snapshot {
    fn default() -> Self {
        Self {
            phase: "stopped".into(),
            owned: false,
            can_stop: false,
            pid: None,
            url: URL.into(),
            mode: None,
            network: None,
            phone_urls: vec![],
            started_at: None,
            error: None,
            logs: VecDeque::new(),
        }
    }
}

type Shared = Arc<Mutex<Snapshot>>;

fn update(state: &Shared, edit: impl FnOnce(&mut Snapshot)) {
    // Aucun appel utilisateur ni I/O pendant le verrou.
    edit(
        &mut state
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner()),
    );
}

fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

fn log(state: &Shared, source: &str, message: impl Into<String>) {
    update(state, |s| {
        let id = s.logs.back().map_or(1, |line| line.id + 1);
        // Une sortie anormale ne peut remplir la mémoire ou bloquer l'interface.
        let text: String = message.into().chars().take(2000).collect();
        s.logs.push_back(LogLine {
            id,
            time: now(),
            source: source.into(),
            text,
        });
        while s.logs.len() > LOG_LIMIT {
            s.logs.pop_front();
        }
    });
}

fn fail(state: &Shared, error: impl Into<String>) {
    let error = error.into();
    log(state, "lanceur", &error);
    update(state, |s| {
        s.phase = "error".into();
        s.error = Some(error);
    });
}

fn read_output(state: Shared, source: &'static str, output: impl Read + Send + 'static) {
    thread::spawn(move || {
        let mut reader = BufReader::new(output);
        // Lire en segments bornés, y compris une ligne qui n'a pas de fin.
        loop {
            let mut chunk = Vec::new();
            match reader.by_ref().take(8192).read_until(b'\n', &mut chunk) {
                Ok(0) => break,
                Ok(_) => {
                    let text = String::from_utf8_lossy(&chunk);
                    let text = text.trim();
                    if !text.is_empty() {
                        log(&state, source, text);
                    }
                }
                Err(error) => {
                    log(&state, "lanceur", format!("Lecture du journal : {error}"));
                    break;
                }
            }
        }
    });
}

enum Request {
    Start(Options),
    Stop,
    Quit(mpsc::Sender<()>),
}

pub struct Controller {
    sender: mpsc::SyncSender<Request>,
    state: Shared,
}

impl Controller {
    pub fn new(root: PathBuf, port: u16) -> Self {
        let state = Arc::new(Mutex::new(Snapshot {
            url: format!("http://127.0.0.1:{port}"),
            ..Snapshot::default()
        }));
        let (sender, receiver) = mpsc::sync_channel(8);
        let worker_state = state.clone();
        thread::spawn(move || run(root, port, receiver, worker_state));
        Self { sender, state }
    }

    pub fn snapshot(&self) -> Snapshot {
        self.state.lock().unwrap_or_else(|p| p.into_inner()).clone()
    }

    pub fn start(&self, options: Options) -> Result<(), String> {
        self.sender
            .try_send(Request::Start(options))
            .map_err(|e| format!("Lanceur indisponible : {e}"))
    }

    pub fn stop(&self) -> Result<(), String> {
        if !self.snapshot().can_stop {
            return Err(
                "Arrêt local indisponible. Arrêter la console avec Ctrl+C, puis relancer Fitness."
                    .into(),
            );
        }
        self.sender
            .try_send(Request::Stop)
            .map_err(|e| format!("Arrêt indisponible : {e}"))
    }

    pub fn shutdown(&self) {
        let (sender, receiver) = mpsc::channel();
        if self.sender.send(Request::Quit(sender)).is_ok() {
            let _ = receiver.recv_timeout(Duration::from_secs(15));
        }
    }
}

struct OwnedChild {
    child: Child,
    _job: ProcessJob,
    preparing: bool,
    options: Options,
    launched: Instant,
    stop_requested: Option<Instant>,
    instance_id: String,
}

fn spawn(
    root: &Path,
    port: u16,
    options: Options,
    preparing: bool,
    state: &Shared,
) -> Result<OwnedChild, String> {
    let instance_id = format!(
        "{}-{}",
        std::process::id(),
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos()
    );
    let mut command = if preparing {
        let mut cmd = Command::new("powershell.exe");
        cmd.args(["-NoProfile", "-NonInteractive", "-File"])
            .arg(root.join("start-app.ps1"))
            .args(["-Preparer", "-Port", &port.to_string()])
            .env_remove("PSModulePath");
        cmd
    } else {
        let mut cmd = Command::new(root.join(".venv/Scripts/python.exe"));
        cmd.args([
            "-u",
            "-m",
            "backend",
            "--managed",
            "--port",
            &port.to_string(),
            "--host",
        ])
        .arg(if options.network {
            "0.0.0.0"
        } else {
            "127.0.0.1"
        });
        if options.simulation {
            cmd.arg("--simulation");
        }
        cmd
    };
    command
        .current_dir(root)
        .env("PYTHONUTF8", "1")
        .env("FITNESS_SERVER_INSTANCE", &instance_id)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    let mut child = hidden(&mut command)
        .spawn()
        .map_err(|e| format!("Démarrage impossible : {e}"))?;
    let job = match ProcessJob::attach(&mut child) {
        Ok(job) => job,
        Err(error) => {
            let _ = child.kill();
            let _ = child.wait();
            return Err(format!(
                "Impossible de superviser le processus Windows : {error}"
            ));
        }
    };
    if let Some(stdout) = child.stdout.take() {
        read_output(state.clone(), "serveur", stdout);
    }
    if let Some(stderr) = child.stderr.take() {
        read_output(state.clone(), "stderr", stderr);
    }
    update(state, |s| {
        s.owned = true;
        s.can_stop = true;
        s.pid = Some(child.id());
    });
    Ok(OwnedChild {
        child,
        _job: job,
        preparing,
        options,
        launched: Instant::now(),
        stop_requested: None,
        instance_id,
    })
}

#[derive(Deserialize)]
struct Health {
    app: String,
    mode: String,
    interface: bool,
    network: Network,
    #[serde(default)]
    instance_id: Option<String>,
    #[serde(default)]
    pid: Option<u32>,
}

#[derive(Deserialize)]
struct LocalControl {
    pid: u32,
    port: u16,
    instance_id: String,
    project_root: PathBuf,
    token: String,
}

impl LocalControl {
    fn read(root: &Path, info: &Health, port: u16) -> Result<Self, String> {
        let pid = info.pid.ok_or("Ce serveur ne fournit pas son identité. Arrêter sa console avec Ctrl+C, puis relancer Fitness.")?;
        let data = std::env::var_os("FITNESS_DATA_DIR")
            .map(PathBuf::from)
            .or_else(|| {
                std::env::var_os("LOCALAPPDATA").map(|path| PathBuf::from(path).join("FitnessApp"))
            })
            .ok_or("Le dossier des données Windows est indisponible pour le lanceur.")?;
        let path = data.join(format!("launcher/servers/{pid}.json"));
        let file = match std::fs::File::open(&path) {
            Ok(file) => file,
            Err(error) => {
                #[cfg(windows)]
                if error.kind() == std::io::ErrorKind::NotFound {
                    if let Some(control) = Self::read_redirected(root, info, port, &data, pid)? {
                        return Ok(control);
                    }
                }
                return Err(format!(
                    "Lecture du canal d'arrêt impossible dans {} : {error}",
                    path.display()
                ));
            }
        };
        Self::read_file(root, info, port, file)
    }

    #[cfg(windows)]
    fn read_redirected(
        root: &Path,
        info: &Health,
        port: u16,
        data: &Path,
        pid: u32,
    ) -> Result<Option<Self>, String> {
        // MSIX peut rediriger AppData vers le cache privé du processus qui a lancé Python.
        // Les chemins restent dans le compte courant ; chaque candidat est vérifié comme le canal habituel.
        let Some(local) = std::env::var_os("LOCALAPPDATA").map(PathBuf::from) else {
            return Ok(None);
        };
        let Ok(relative) = data.strip_prefix(&local) else {
            return Ok(None);
        };
        let packages = match std::fs::read_dir(local.join("Packages")) {
            Ok(packages) => packages,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
            Err(error) => {
                return Err(format!(
                    "Recherche du canal Windows redirigé impossible : {error}"
                ))
            }
        };
        let mut invalid = None;
        for package in packages {
            let package = package.map_err(|error| {
                format!("Lecture des dossiers Windows redirigés impossible : {error}")
            })?;
            let path = package
                .path()
                .join("LocalCache/Local")
                .join(relative)
                .join(format!("launcher/servers/{pid}.json"));
            let result = match std::fs::File::open(&path) {
                Ok(file) => Self::read_file(root, info, port, file),
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => continue,
                Err(error) => Err(format!(
                    "Lecture du canal redirigé {} impossible : {error}",
                    path.display()
                )),
            };
            match result {
                Ok(control) => return Ok(Some(control)),
                Err(error) => invalid = Some(error),
            }
        }
        match invalid {
            Some(error) => Err(error),
            None => Ok(None),
        }
    }

    fn read_file(
        root: &Path,
        info: &Health,
        port: u16,
        file: std::fs::File,
    ) -> Result<Self, String> {
        let control: Self = serde_json::from_reader(file.take(16384))
            .map_err(|_| "Le fichier du canal d'arrêt local est invalide.")?;
        let canonical_root = root
            .canonicalize()
            .map_err(|error| format!("Le dossier du lanceur est inaccessible : {error}"))?;
        let server_root = control
            .project_root
            .canonicalize()
            .map_err(|error| format!("Le dossier du serveur est inaccessible : {error}"))?;
        if server_root != canonical_root {
            return Err(format!(
                "Le serveur vient d'un autre dossier : {} (lanceur : {}).",
                server_root.display(),
                canonical_root.display()
            ));
        }
        if Some(control.pid) != info.pid
            || control.port != port
            || Some(control.instance_id.as_str()) != info.instance_id.as_deref()
        {
            return Err(
                "Le canal d'arrêt ne correspond pas au serveur actif. Aucun arrêt envoyé.".into(),
            );
        }
        if control.token.len() != 64 || !control.token.bytes().all(|byte| byte.is_ascii_hexdigit())
        {
            return Err("La clé du canal d'arrêt local est invalide. Arrêter sa console avec Ctrl+C, puis relancer Fitness.".into());
        }
        Ok(control)
    }

    fn stop(&self, agent: &ureq::Agent, url: &str) -> Result<(), String> {
        let response = agent
            .post(&format!("{url}/api/launcher/stop"))
            .header("Authorization", &format!("Bearer {}", self.token))
            .send_json(serde_json::json!({ "instance_id": self.instance_id }))
            .map_err(|error| format!("Arrêt local refusé ou serveur indisponible : {error}"))?;
        if response.status().as_u16() != 202 {
            return Err("Le serveur n'a pas confirmé la demande d'arrêt.".into());
        }
        Ok(())
    }
}

struct ExternalStop {
    instance_id: String,
    requested: Instant,
}

#[derive(Deserialize)]
struct Network {
    enabled: bool,
    addresses: Vec<String>,
}

fn health(agent: &ureq::Agent, url: &str) -> Option<Health> {
    let info: Health = agent
        .get(&format!("{url}/api/health"))
        .call()
        .ok()?
        .body_mut()
        .with_config()
        .limit(16384)
        .read_json()
        .ok()?;
    (info.app == "Fitness" && matches!(info.mode.as_str(), "reel" | "simulation")).then_some(info)
}

fn port_busy(port: u16) -> bool {
    TcpStream::connect_timeout(
        &SocketAddr::from(([127, 0, 0, 1], port)),
        Duration::from_millis(150),
    )
    .is_ok()
}

fn apply_health(state: &Shared, info: Health, owned: bool, port: u16) {
    update(state, |s| {
        s.phase = if owned {
            if info.interface {
                "running"
            } else {
                "error"
            }
        } else {
            "external"
        }
        .into();
        s.mode = Some(info.mode);
        s.network = Some(info.network.enabled);
        // Les adresses sont validées avant de devenir des URLs, jamais ouvertes sur demande arbitraire.
        s.phone_urls = if info.network.enabled {
            info.network
                .addresses
                .iter()
                .filter_map(|ip| ip.parse::<std::net::Ipv4Addr>().ok())
                .map(|ip| format!("http://{ip}:{port}"))
                .collect()
        } else {
            vec![]
        };
        s.error = if info.interface {
            None
        } else {
            Some(INTERFACE_ERROR.into())
        };
    });
}

fn apply_external(state: &Shared, info: Health, root: &Path, port: u16) -> Option<LocalControl> {
    let control = LocalControl::read(root, &info, port);
    let pid = info.pid;
    let previous = state.lock().unwrap_or_else(|p| p.into_inner()).clone();
    if let Err(error) = &control {
        if previous.phase != "external"
            || previous.pid != pid
            || previous.error.as_ref() != Some(error)
        {
            log(state, "lanceur", error);
        }
    }
    apply_health(state, info, false, port);
    update(state, |s| {
        s.pid = pid;
        s.can_stop = control.is_ok();
        if let Err(error) = &control {
            s.error = Some(error.clone());
        } else if previous.phase == "external"
            && previous.pid == pid
            && previous.can_stop
            && previous.error.as_deref() != Some(INTERFACE_ERROR)
        {
            // Une erreur d'arrêt reste visible jusqu'à une nouvelle action ou un nouveau serveur.
            s.error = previous.error;
        }
    });
    if control.is_ok() && (!previous.can_stop || previous.pid != pid) {
        log(
            state,
            "lanceur",
            "Serveur Fitness lancé ailleurs détecté. Arrêt disponible ici.",
        );
    }
    control.ok()
}

fn request_stop(child: &mut OwnedChild, state: &Shared) {
    if child.stop_requested.is_some() {
        return;
    }
    update(state, |s| {
        s.phase = "stopping".into();
    });
    log(state, "lanceur", "Arrêt demandé.");
    if child.preparing {
        // Pendant pip/npm il n'y a pas encore de serveur ou de base ouverte.
        if let Err(error) = child.child.kill() {
            log(state, "lanceur", format!("Annulation : {error}"));
        }
    } else if let Some(mut stdin) = child.child.stdin.take() {
        if let Err(error) = stdin.write_all(b"stop\n") {
            log(state, "lanceur", format!("Canal d'arrêt : {error}"));
        }
        // Fermeture du canal : le backend considère aussi EOF comme un arrêt.
    }
    child.stop_requested = Some(Instant::now());
}

fn run(root: PathBuf, port: u16, receiver: mpsc::Receiver<Request>, state: Shared) {
    let url = format!("http://127.0.0.1:{port}");
    let agent = ureq::Agent::config_builder()
        .timeout_global(Some(Duration::from_millis(700)))
        .max_redirects(0)
        .proxy(None)
        .build()
        .new_agent();
    let mut child: Option<OwnedChild> = None;
    let mut external: Option<LocalControl> = None;
    let mut external_stop: Option<ExternalStop> = None;
    let mut last_health = Instant::now() - Duration::from_secs(3);
    let mut quitting: Option<mpsc::Sender<()>> = None;
    loop {
        let health_interval = if external_stop.is_some() {
            Duration::from_millis(250)
        } else {
            Duration::from_secs(2)
        };
        match receiver.recv_timeout(Duration::from_millis(100)) {
            Ok(Request::Start(options))
                if child.is_none() && quitting.is_none() && external_stop.is_none() =>
            {
                if let Some(info) = health(&agent, &url) {
                    external = apply_external(&state, info, &root, port);
                    continue;
                }
                if port_busy(port) {
                    fail(&state, format!("Le port {port} est occupé par un autre service. Aucun processus n'a été arrêté."));
                    continue;
                }
                update(&state, |s| {
                    s.phase = "preparing".into();
                    s.error = None;
                    s.mode = Some(
                        if options.simulation {
                            "simulation"
                        } else {
                            "reel"
                        }
                        .into(),
                    );
                    s.network = Some(options.network);
                    s.phone_urls.clear();
                    s.started_at = None;
                });
                log(
                    &state,
                    "lanceur",
                    "Vérification de Python, des dépendances et de l'interface…",
                );
                match spawn(&root, port, options, true, &state) {
                    Ok(process) => child = Some(process),
                    Err(error) => fail(&state, error),
                }
            }
            Ok(Request::Stop) => {
                if let Some(process) = child.as_mut() {
                    update(&state, |s| s.error = None);
                    request_stop(process, &state);
                } else if external_stop.is_none() {
                    let result = (|| {
                        let expected = external.as_ref().ok_or("Arrêt local indisponible.")?;
                        let info = health(&agent, &url)
                            .ok_or("Le serveur ne répond plus. Actualiser son état.")?;
                        let current = LocalControl::read(&root, &info, port)?;
                        if current.instance_id != expected.instance_id
                            || current.pid != expected.pid
                        {
                            return Err(
                                "Le serveur a changé. Aucun nouveau serveur n'a été arrêté."
                                    .to_string(),
                            );
                        }
                        current.stop(&agent, &url)?;
                        Ok(current.instance_id)
                    })();
                    match result {
                        Ok(instance_id) => {
                            external_stop = Some(ExternalStop {
                                instance_id,
                                requested: Instant::now(),
                            });
                            update(&state, |s| {
                                s.phase = "stopping".into();
                                s.can_stop = false;
                                s.error = None;
                            });
                            last_health = Instant::now() - Duration::from_secs(3);
                            log(
                                &state,
                                "lanceur",
                                "Arrêt propre demandé au serveur lancé ailleurs.",
                            );
                        }
                        Err(error) => {
                            log(&state, "lanceur", &error);
                            update(&state, |s| s.error = Some(error));
                        }
                    }
                }
            }
            Ok(Request::Quit(done)) => {
                quitting = Some(done);
                if let Some(process) = child.as_mut() {
                    request_stop(process, &state);
                }
            }
            Err(mpsc::RecvTimeoutError::Disconnected) => {
                if let Some(process) = child.as_mut() {
                    request_stop(process, &state);
                }
                // La fin du dernier Controller déclenche aussi un arrêt.
                if quitting.is_none() {
                    quitting = Some(mpsc::channel().0);
                }
            }
            _ => {}
        }

        if let Some(process) = child.as_mut() {
            match process.child.try_wait() {
                Ok(Some(exit)) => {
                    let process = child.take().expect("processus détenu");
                    update(&state, |s| {
                        s.owned = false;
                        s.can_stop = false;
                        s.pid = None;
                        s.phone_urls.clear();
                        s.started_at = None;
                    });
                    if process.stop_requested.is_some() {
                        update(&state, |s| {
                            s.phase = if s.error.is_some() {
                                "error"
                            } else {
                                "stopped"
                            }
                            .into();
                        });
                        log(&state, "lanceur", "Serveur arrêté.");
                    } else if process.preparing && exit.success() && quitting.is_none() {
                        let options = process.options.clone();
                        drop(process); // Libérer le Job de préparation avant de lancer Python.
                        update(&state, |s| {
                            s.phase = "starting".into();
                        });
                        log(&state, "lanceur", "Démarrage du serveur Fitness…");
                        match spawn(&root, port, options, false, &state) {
                            Ok(p) => child = Some(p),
                            Err(e) => fail(&state, e),
                        }
                    } else {
                        fail(
                            &state,
                            format!(
                                "{} (code {}). Consulter le journal.",
                                if process.preparing {
                                    "La préparation a échoué"
                                } else {
                                    "Le serveur s'est arrêté sans demande"
                                },
                                exit
                            ),
                        );
                    }
                }
                Err(error) => {
                    fail(&state, format!("Lecture de l'état du processus : {error}"));
                    request_stop(process, &state);
                }
                Ok(None) => {
                    if process
                        .stop_requested
                        .is_some_and(|at| at.elapsed() > Duration::from_secs(10))
                    {
                        fail(&state, "L'arrêt propre n'a pas abouti sous 10 s. Arrêt forcé du processus détenu. Consulter le journal avant de relancer.");
                        if let Err(error) = process.child.kill() {
                            log(
                                &state,
                                "lanceur",
                                format!("Arrêt forcé impossible : {error}"),
                            );
                        }
                        process.stop_requested = Some(Instant::now());
                    } else if !process.preparing
                        && process.stop_requested.is_none()
                        && last_health.elapsed() >= Duration::from_secs(1)
                    {
                        last_health = Instant::now();
                        if let Some(info) = health(&agent, &url) {
                            let expected_mode = if process.options.simulation {
                                "simulation"
                            } else {
                                "reel"
                            };
                            if info.instance_id.as_deref() == Some(process.instance_id.as_str())
                                && info.mode == expected_mode
                                && info.network.enabled == process.options.network
                            {
                                let first_ready = state
                                    .lock()
                                    .unwrap_or_else(|p| p.into_inner())
                                    .started_at
                                    .is_none();
                                let interface_ready = info.interface;
                                apply_health(&state, info, true, port);
                                if first_ready && interface_ready {
                                    update(&state, |s| s.started_at = Some(now()));
                                    log(
                                        &state,
                                        "lanceur",
                                        "Fitness répond. L'application est prête.",
                                    );
                                }
                            } else {
                                fail(&state, "Un autre serveur répond sur le port attendu. Arrêt de notre processus.");
                                request_stop(process, &state);
                            }
                        } else if process.launched.elapsed() > Duration::from_secs(20) {
                            let ready = state
                                .lock()
                                .unwrap_or_else(|p| p.into_inner())
                                .started_at
                                .is_some();
                            if ready {
                                let phase = state
                                    .lock()
                                    .unwrap_or_else(|p| p.into_inner())
                                    .phase
                                    .clone();
                                if phase != "error" {
                                    fail(&state, "Le serveur ne répond plus. Vous pouvez l'arrêter ; aucune relance automatique.");
                                }
                            } else {
                                fail(
                                    &state,
                                    "Le serveur n'a pas répondu sous 20 s. Arrêt demandé.",
                                );
                                request_stop(process, &state);
                            }
                        }
                    }
                }
            }
        } else if last_health.elapsed() >= health_interval && quitting.is_none() {
            last_health = Instant::now();
            let info = health(&agent, &url);
            if let Some(stopping) = external_stop.as_ref() {
                if info.is_none() && !port_busy(port) {
                    external_stop = None;
                    external = None;
                    update(&state, |s| {
                        *s = Snapshot {
                            logs: s.logs.clone(),
                            url: s.url.clone(),
                            ..Snapshot::default()
                        }
                    });
                    log(&state, "lanceur", "Serveur arrêté.");
                } else if info.as_ref().is_some_and(|info| {
                    info.instance_id.as_deref() != Some(stopping.instance_id.as_str())
                }) {
                    external_stop = None;
                    external = None;
                    fail(
                        &state,
                        "Le serveur a changé pendant l'arrêt. Aucun nouvel arrêt envoyé.",
                    );
                    update(&state, |s| s.can_stop = false);
                } else if stopping.requested.elapsed() > Duration::from_secs(10) {
                    external_stop = None;
                    let error = "L'arrêt n'a pas abouti sous 10 s. Le serveur externe reste actif ; aucun arrêt forcé.";
                    log(&state, "lanceur", error);
                    update(&state, |s| {
                        s.phase = "external".into();
                        s.can_stop = true;
                        s.error = Some(error.into());
                    });
                }
            } else if let Some(info) = info {
                external = apply_external(&state, info, &root, port);
            } else {
                external = None;
                update(&state, |s| {
                    if s.phase == "external" {
                        *s = Snapshot {
                            logs: s.logs.clone(),
                            url: s.url.clone(),
                            ..Snapshot::default()
                        };
                    }
                });
            }
        }
        if child.is_none() {
            if let Some(done) = quitting.take() {
                let _ = done.send(());
                break;
            }
        }
    }
}

pub fn project_root() -> Result<PathBuf, String> {
    let executable = std::env::current_exe().map_err(|e| e.to_string())?;
    executable
        .ancestors()
        .skip(1)
        .find(|path| {
            path.join("start-app.ps1").is_file() && path.join("backend/__main__.py").is_file()
        })
        .map(Path::to_path_buf)
        .ok_or_else(|| {
            "Le lanceur doit rester dans le dossier du projet Fitness (launcher/bin).".into()
        })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn journal_est_borne_et_ordonne() {
        let state = Arc::new(Mutex::new(Snapshot::default()));
        for _ in 0..250 {
            log(&state, "test", "x".repeat(3000));
        }
        let s = state.lock().unwrap();
        assert_eq!(s.logs.len(), 200);
        assert_eq!(s.logs.front().unwrap().id, 51);
        assert_eq!(s.logs.back().unwrap().id, 250);
        assert_eq!(s.logs.back().unwrap().text.len(), 2000);
    }

    #[test]
    fn serveur_externe_non_detenu_et_adresses_validees() {
        let state = Arc::new(Mutex::new(Snapshot::default()));
        apply_health(
            &state,
            Health {
                app: "Fitness".into(),
                mode: "reel".into(),
                interface: true,
                instance_id: None,
                pid: None,
                network: Network {
                    enabled: true,
                    addresses: vec!["192.168.1.10".into(), "evil/../".into()],
                },
            },
            false,
            4330,
        );
        let s = state.lock().unwrap();
        assert_eq!(s.phase, "external");
        assert!(!s.owned);
        assert_eq!(s.phone_urls, ["http://192.168.1.10:4330"]);
    }
}
