package fr.fitnessapp.sante;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.health.connect.HealthConnectException;
import android.health.connect.HealthConnectManager;
import android.health.connect.HealthPermissions;
import android.health.connect.InsertRecordsResponse;
import android.health.connect.datatypes.ActiveCaloriesBurnedRecord;
import android.health.connect.datatypes.DistanceRecord;
import android.health.connect.datatypes.ExerciseSessionRecord;
import android.health.connect.datatypes.ExerciseSessionType;
import android.health.connect.datatypes.Metadata;
import android.health.connect.datatypes.Record;
import android.health.connect.datatypes.units.Energy;
import android.health.connect.datatypes.units.Length;
import android.net.Uri;
import android.os.Bundle;
import android.os.OutcomeReceiver;
import android.util.Log;
import android.widget.Toast;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import org.json.JSONObject;

/** Receives an explicit Chrome intent from the paired FitnessApp browser. No network permission. */
public final class SaveWorkout extends Activity {
    private SharedPreferences pairing;
    private JSONObject workout;
    private String token, profile, name;
    // A deliberate re-send can correct the activity or the chosen energy estimate.
    private final long revision = System.currentTimeMillis();
    private final List<Record> records = new ArrayList<>();
    private final List<String> permissions = new ArrayList<>();

    @Override public void onCreate(Bundle savedState) {
        super.onCreate(savedState);
        pairing = getSharedPreferences("phone", MODE_PRIVATE);
        if (!Intent.ACTION_VIEW.equals(getIntent().getAction())) {
            showSettings(Intent.ACTION_MAIN.equals(getIntent().getAction()));
            return;
        }
        try {
            Uri uri = getIntent().getData();
            if (uri == null || !"fitnessappsante".equals(uri.getScheme()) || !"save".equals(uri.getHost()))
                throw new IllegalArgumentException();
            token = getIntent().getStringExtra("pair");
            String input = getIntent().getStringExtra("workout");
            if (token == null || !token.matches("[0-9a-f]{64}") || input == null || input.length() > 4096)
                throw new IllegalArgumentException();
            workout = new JSONObject(input);
            profile = workout.getString("profil");
            name = workout.getString("nom");
            if (!profile.matches("[a-zA-Z0-9_-]{1,80}") || name.isBlank() || name.length() > 100)
                throw new IllegalArgumentException();
            prepareRecords();
        } catch (Exception ex) {
            message("Bilan invalide", "Rouvrez une séance terminée dans FitnessApp.");
            return;
        }
        if (!pairing.contains("token")) {
            new AlertDialog.Builder(this).setTitle("Associer le profil " + name + " ?")
                .setMessage("Acceptez uniquement si vous venez de toucher Enregistrer dans votre bilan. Ce navigateur pourra ensuite écrire les séances de ce profil dans Santé Connect.")
                .setPositiveButton("Associer et enregistrer", (d, w) -> {
                    if (pairing.edit().putString("token", token).putString("profile", profile).putString("name", name).commit()) authorize();
                    else message("Association impossible", "Android n’a pas pu mémoriser le profil.");
                }).setNegativeButton("Annuler", (d, w) -> finish()).setOnCancelListener(d -> finish()).show();
        } else if (token.equals(pairing.getString("token", "")) && profile.equals(pairing.getString("profile", ""))) {
            requestingPermissions = savedState != null && savedState.getBoolean("permissions");
            if (!requestingPermissions) authorize();
        } else {
            message("Téléphone associé à un autre profil ou navigateur", "Revenez au profil associé. Pour changer volontairement d’association, ouvrez FitnessApp Santé depuis vos applications.");
        }
    }

    private Metadata metadata(String kind) throws Exception {
        return new Metadata.Builder().setClientRecordId("fitness:" + profile + ":" + workout.getString("seance") + ":" + kind)
            .setClientRecordVersion(revision).setRecordingMethod(Metadata.RECORDING_METHOD_ACTIVELY_RECORDED).build();
    }

    private void prepareRecords() throws Exception {
        if (workout.getInt("version") != 1 || !workout.getString("seance").matches("[a-zA-Z0-9_-]{1,80}"))
            throw new IllegalArgumentException();
        Instant start = Instant.parse(workout.getString("debut"));
        int duration = workout.getInt("duree_secondes");
        double kcal = workout.getDouble("calories_actives");
        if (duration < 1 || !Double.isFinite(kcal) || kcal < 0)
            throw new IllegalArgumentException();
        Instant end = start.plusSeconds(duration);
        String activity = workout.getString("activite");
        boolean run = "Running".equals(activity);
        if (!run && !"Walking".equals(activity)) throw new IllegalArgumentException();
        int type = run ? ExerciseSessionType.EXERCISE_SESSION_TYPE_RUNNING_TREADMILL : ExerciseSessionType.EXERCISE_SESSION_TYPE_WALKING;
        records.add(new ExerciseSessionRecord.Builder(metadata("session"), start, end, type)
            .setTitle(run ? "Course sur tapis" : "Marche sur tapis").setNotes(workout.getString("note")).build());
        permissions.add(HealthPermissions.WRITE_EXERCISE);
        // Android's Energy.fromCalories takes small calories, while the bilan stores kcal.
        records.add(new ActiveCaloriesBurnedRecord.Builder(metadata("kcal"), start, end, Energy.fromCalories(kcal * 1000)).build());
        permissions.add(HealthPermissions.WRITE_ACTIVE_CALORIES_BURNED);
        if (workout.has("distance_metres")) {
            double meters = workout.getDouble("distance_metres");
            if (!Double.isFinite(meters) || meters < 0) throw new IllegalArgumentException();
            records.add(new DistanceRecord.Builder(metadata("distance"), start, end, Length.fromMeters(meters)).build());
            permissions.add(HealthPermissions.WRITE_DISTANCE);
        }
    }

    private boolean requestingPermissions;
    private void authorize() {
        List<String> missing = new ArrayList<>();
        for (String p : permissions) if (checkSelfPermission(p) != PackageManager.PERMISSION_GRANTED) missing.add(p);
        if (missing.isEmpty()) { write(); return; }
        requestingPermissions = true;
        requestPermissions(missing.toArray(new String[0]), 1);
    }

    @Override protected void onSaveInstanceState(Bundle state) {
        super.onSaveInstanceState(state);
        state.putBoolean("permissions", requestingPermissions);
    }

    @Override public void onRequestPermissionsResult(int code, String[] requested, int[] results) {
        super.onRequestPermissionsResult(code, requested, results);
        if (code != 1) return;
        requestingPermissions = false;
        for (String p : permissions) if (checkSelfPermission(p) != PackageManager.PERMISSION_GRANTED) {
            message("Autorisation manquante", "Dans les paramètres de Santé Connect, autorisez FitnessApp Santé à écrire les données proposées, puis revenez au bilan.");
            return;
        }
        write();
    }

    private void write() {
        HealthConnectManager manager = getSystemService(HealthConnectManager.class);
        if (manager == null) { message("Santé Connect indisponible", "Vérifiez Santé Connect dans les paramètres Android."); return; }
        try {
            manager.insertRecords(records, getMainExecutor(), new OutcomeReceiver<InsertRecordsResponse, HealthConnectException>() {
                public void onResult(InsertRecordsResponse result) {
                    Toast.makeText(SaveWorkout.this, "Séance enregistrée dans Santé Connect", Toast.LENGTH_LONG).show();
                    finish();
                }
                public void onError(HealthConnectException ex) {
                    Log.w("FitnessAppSante", "Écriture refusée, code " + ex.getErrorCode());
                    message("Écriture refusée", "Santé Connect a renvoyé le code " + ex.getErrorCode() + ". Vérifiez les autorisations avant de réessayer depuis le bilan.");
                }
            });
        } catch (RuntimeException ex) {
            Log.w("FitnessAppSante", "Écriture indisponible : " + ex.getClass().getSimpleName());
            message("Écriture indisponible", "Vérifiez l’état de Santé Connect et ses autorisations.");
        }
    }

    private void message(String title, String text) {
        if (isFinishing() || isDestroyed()) return;
        new AlertDialog.Builder(this).setTitle(title).setMessage(text)
            .setPositiveButton("Fermer", (d, w) -> finish()).setOnCancelListener(d -> finish()).show();
    }

    private void showSettings(boolean launcher) {
        AlertDialog.Builder dialog = new AlertDialog.Builder(this).setTitle("FitnessApp Santé")
            .setMessage("Depuis votre bilan FitnessApp, touchez Enregistrer la séance. Cette application écrit l’exercice, la distance disponible et les calories actives sur ce téléphone. Elle ne lit pas vos données et ne se connecte pas à Internet."
                + (pairing.contains("token") ? "\n\nProfil associé : " + pairing.getString("name", "") : ""))
            .setPositiveButton("Fermer", (d, w) -> finish()).setOnCancelListener(d -> finish());
        if (launcher && pairing.contains("token")) dialog.setNeutralButton("Dissocier", (d, w) ->
            new AlertDialog.Builder(this).setTitle("Dissocier ce navigateur ?").setMessage("Les séances déjà enregistrées restent dans Santé Connect.")
                .setPositiveButton("Dissocier", (a, b) -> { pairing.edit().clear().apply(); finish(); })
                .setNegativeButton("Annuler", (a, b) -> finish()).setOnCancelListener(a -> finish()).show());
        dialog.show();
    }
}
