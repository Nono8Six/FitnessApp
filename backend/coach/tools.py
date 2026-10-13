"""Liste fermée d'outils. Aucun identifiant de profil n'est accepté du modèle."""
import json
from datetime import datetime

from typing import Annotated

from pydantic import Field, StringConstraints, ValidationError, field_validator
from sqlalchemy import func, select
from sqlalchemy.exc import SQLAlchemyError

from . import store
from . import workout_proposals, memory, insights, recommendations, constraints
from ..storage.models import Workout, WorkoutSelection, WorkoutVersion
from ..training import catalog, workouts
from ..training.profiles import ProfileNotFound, get_profile
from ..training.workouts import Input


class Search(Input):
    query: str = Field(default="", max_length=100)
    offset: int = Field(default=0, ge=0, le=1000000)
    limit: int = Field(default=10, ge=1, le=20)


class Detail(Input):
    workout_id: str = Field(pattern=r"^[a-f0-9]{32}$")
    version: int | None = Field(default=None, ge=1)


class Versions(Input):
    workout_id: str = Field(pattern=r"^[a-f0-9]{32}$")
    offset: int = Field(default=0, ge=0, le=1000000)
    limit: int = Field(default=10, ge=1, le=20)


class History(Input):
    conversation_id: str = Field(pattern=r"^[a-f0-9]{32}$")
    offset: int = Field(default=0, ge=0, le=1000000)
    limit: int = Field(default=3, ge=1, le=5)


class MessageDetail(Input):
    turn_id: str = Field(pattern=r"^[a-f0-9]{32}$")
    offset: int = Field(default=0, ge=0, le=32000)
    limit: int = Field(default=3000, ge=100, le=6000)


Choice = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=60)]


class Question(Input):
    label: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=80)] = Field(
        description="Question courte, ex. « Temps disponible ».")
    options: list[Choice] = Field(min_length=2, max_length=5,
        description="Réponses courtes et distinctes, sans lettre A/B/C. « Autre » est ajouté par l'interface.")

    @field_validator("options")
    @classmethod
    def distinct(cls, value):
        if len({v.casefold() for v in value}) != len(value):
            raise ValueError("Options en double")
        return value


class Questions(Input):
    questions: list[Question] = Field(min_length=1, max_length=3)


class Sessions(Search):
    since: str | None = Field(default=None, pattern=r'^\d{4}-\d{2}-\d{2}T')


class SessionDetail(Input):
    session_id: str = Field(pattern=r'^[a-f0-9]{32}$')


class Samples(SessionDetail):
    offset: int = Field(default=0, ge=0)
    limit: int = Field(default=100, ge=1, le=200)


class Progress(Input):
    days: int = Field(default=28, ge=1, le=365)


class Comparison(Input):
    first_id: str = Field(pattern=r'^[a-f0-9]{32}$')
    second_id: str = Field(pattern=r'^[a-f0-9]{32}$')


DEFINITIONS = {
    'capture_context': (memory.Capture, 'Extraire les faits utiles cités exactement par la personne et les contraintes de sa demande. Examiner aussi relevant_history et fournir reviewed_turn_ids pour les échanges effectivement examinés. Appeler avant la réponse. Ne retenir aucune inférence médicale. Restriction sensible : confirmation humaine. source_turn_id pour une ancienne déclaration accessible ; null pour le message actuel. preferred_duration en secondes, allures en km/h, pente en %. Une liste vide est valide si aucun nouveau fait.'),
    'list_sessions': (Sessions, 'Retrouver toutes les séances exécutées du profil, même anciennes : date, clôture, ressenti, source. Pagination ; mode réel/simulation imposé par le serveur.'),
    'get_session': (SessionDetail, 'Lire le bilan exact : mesures, couverture, profil au départ, interruptions et ressenti. Source ouvrable dans Bilans.'),
    'get_session_samples': (Samples, 'Lire les mesures d’une séance par tranches bornées, sans combler les trous.'),
    'get_feedback': (SessionDetail, 'Lire le ressenti daté de la séance et son bilan.'),
    'get_progress': (Progress, 'Comparer les séances reçues pendant une période. Résultats partiels signalés ; aucun score physiologique inventé.'),
    'compare_sessions': (Comparison, 'Lire deux bilans du profil pour comparer programme, effort, ressenti et couverture.'),
    'recommend_workout': (recommendations.Recommendation, 'Construire une base personnalisée avec les allures déclarées ou réellement tolérées, objectif et temps disponible. Renvoie hypothèses, sources scientifiques et estimations. Valider puis proposer ; ne rien enregistrer.'),
    "get_profile": (Input, "Lire le profil actif, objectifs, poids, unités, sélection, date locale et données absentes."),
    "list_workouts": (Search, "Rechercher les séances existantes (dernière version), avec estimations backend. Pagination explicite."),
    "get_workout": (Detail, "Lire une séance ou une version précise : tous les blocs, origine, dates, estimations officielles."),
    "list_versions": (Versions, "Lister les versions datées d'une séance du profil, avec pagination."),
    "search_conversations": (Search, "Retrouver les conversations par leur titre ou le contenu de tous leurs échanges, même anciens."),
    "read_conversation": (History, "Lire les échanges précédents, datés, du plus récent vers les pages plus anciennes, avec les séances proposées. Réponses incomplètes signalées."),
    "read_message": (MessageDetail, "Lire le texte complet d'une ancienne réponse par extraits paginés, après read_conversation."),
    "search_memories": (Search, "Lire les faits et préférences sourcés du profil, dates, origine et statut. Les restrictions en attente ne sont pas des diagnostics."),
    "ask_questions": (Questions, "Afficher 1 à 3 questions à choix en cases interactives sous ta réponse ; l'utilisateur répond dans son prochain message. Une seule fois par réponse."),
    "preview_catalog": (catalog.CatalogCopy, "Construire une base de séance depuis un format FitnessApp, sans enregistrer. template_id : brisk-walk, walk-intervals, hill-plateau, hill-waves, steady-endurance, run-walk. target : durée en secondes OU kcal actives avec le poids du profil. Renvoie blocs, dose et estimations backend ; adapter ensuite à l’allure connue, valider et proposer."),
    "validate_workout": (workout_proposals.ProposalInput, "Valider un programme complet avant proposition : bornes, 5 min d’échauffement et de retour au calme, durée, objectif, niveau et min_active_kcal si demandé. Renvoie les erreurs précises et les prévisions Python. Corriger les erreurs avant de proposer."),
    "propose_workout": (workout_proposals.ProposalInput, "Proposer une séance structurée validée, jamais l'enregistrer. L'interface affiche Enregistrer, Modifier, Ignorer. Si workout_target est fourni par le contexte serveur, ajuster exactement cette version. Sinon target facultatif pour ajuster une version lue via get_workout. Pas de target pour une nouvelle séance."),
}


def definitions(capture_only=False):
    return [{"type": "namespace", "name": "fitness", "description": "Données du seul profil actif. Mémoire automatique sourcée ; séances proposées à accepter par l’utilisateur.",
             "tools": [{"type": "function", "name": name, "description": description,
                        "parameters": model.model_json_schema(), "strict": name == 'ask_questions'}
                       for name, (model, description) in DEFINITIONS.items() if not capture_only or name == 'capture_context']}]


def profile_context(session, profile, simulation):
    selection = session.get(WorkoutSelection, profile)
    return {"profile": get_profile(session, profile).model_dump(),
        "local_date": datetime.now().astimezone().date().isoformat(),
        "timezone": str(datetime.now().astimezone().tzinfo),
        "selected_workout_id": selection.workout_id if selection else None,
        "settings": {"mode": "simulation" if simulation else "reel", "language": "fr", "distance_unit": "km",
                     "incline_unit": "%", "duration_unit": "seconds"},
        "activities": insights.context(session, profile, simulation),
        "training_memory": memory.context(session, profile),
        "missing": ["fatigue actuelle sauf déclaration datée", "santé sauf déclaration explicite", "FC valide non garantie"],
        "catalog_formats": [{"template_id": r.identifier, "name": r.name, "goal": r.goal}
                            for r in catalog.recipes() if r.level == 'easy'],
        "memories": {'total': len(memory.rows(session, profile)), 'note': 'Faits dans training_memory ; détails via search_memories.'}}


def workout_link(data):
    return {"id": data["id"], "version": data["version"], "name": data["name"],
            "href": f"#/seances/{data['id']}?version={data['version']}"}


def summaries(session, query, weight, offset, limit):
    total = session.scalar(select(func.count()).select_from(query.order_by(None).subquery()))
    items = []
    for row in session.scalars(query.offset(offset).limit(limit)):
        data = workouts._out(row, weight)  # Même calcul métier que l'interface.
        items.append({k: v for k, v in data.items() if k not in {"items", "blocks"}} | {"source": workout_link(data)})
    next_offset = offset + len(items) if offset + len(items) < total else None
    return {"items": items, "total": total, "next_offset": next_offset, "partial": next_offset is not None,
            "estimates": "Prévisions recalculées avec le poids actuel ; jamais des résultats réalisés."}


def execute(database, profile, name, arguments, *, user_text, simulation=False, turn_id=None, call_id=None):
    """Le résultat contient des données, jamais des autorisations supplémentaires."""
    if name not in DEFINITIONS:
        return {"error": "Outil non autorisé"}
    try:
        payload = DEFINITIONS[name][0].model_validate_json(arguments)
        if name == 'capture_context':
            if not turn_id:
                return {'error': 'Une réponse identifiée est requise pour mémoriser.'}
            with database.write() as session:
                return memory.capture(session, profile, turn_id, payload)
        if name in {'validate_workout', 'propose_workout'}:
            with database.write() if name == 'propose_workout' else database.transaction() as session:
                current = get_profile(session, profile)
                if payload.target:
                    workout_proposals.snapshot(session, profile, payload.target)
                if name == 'validate_workout':
                    return workout_proposals.validated_preview(payload, current.weight_kg,
                        workout_proposals.request_limits(session, profile, turn_id, user_text))
                if not turn_id or not call_id:
                    return {'error': 'Une réponse du coach et un appel identifiés sont requis.'}
                proposal = workout_proposals.propose(session, profile, turn_id, call_id, payload)
                if 'error' in proposal:
                    return proposal
                return {'workout_proposal': proposal, 'saved': False, 'requires_user_confirmation': True}
        with database.transaction() as session:
            current = get_profile(session, profile)
            if name == "get_profile":
                return profile_context(session, profile, simulation)
            mode = 'simulation' if simulation else 'reel'
            if name == 'recommend_workout':
                return recommendations.recommend(session, profile, payload,
                    workout_proposals.request_limits(session, profile, turn_id, user_text), current.weight_kg, simulation)
            if name == 'list_sessions':
                return insights.listing(session, profile, **payload.model_dump(), mode=mode)
            if name in {'get_session', 'get_feedback'}:
                return insights.detail(session, profile, payload.session_id)
            if name == 'get_session_samples':
                return insights.samples(session, profile, **payload.model_dump())
            if name == 'get_progress':
                return insights.progress(session, profile, payload.days, mode)
            if name == 'compare_sessions':
                data = [insights.detail(session, profile, i) for i in (payload.first_id, payload.second_id)]
                return {'sessions': data, 'sources': [r['source'] for r in data], 'note': 'Comparer à programme, ressenti et couverture comparables.'}
            if name == 'preview_catalog':
                recipe = next((r for r in catalog.recipes()
                               if r.identifier == payload.template_id and r.level == payload.level), None)
                if recipe is None:
                    return {'error': 'Format introuvable. Utiliser un template_id de catalog_formats et un niveau autorisé.'}
                programme = catalog.adapt(recipe, payload.target, current.weight_kg)
                return {'workout': programme.workout.model_dump(),
                        **workouts.preview(programme.workout, current.weight_kg),
                        'method': catalog.methodology(recipe, programme), 'saved': False,
                        'note': 'Base générale à adapter au niveau réel déclaré, pas une mesure des capacités de la personne.'}
            if name == "search_conversations":
                return store.conversations(session, profile, **payload.model_dump())
            if name == "read_conversation":
                result = store.turns(session, profile, payload.conversation_id, payload.offset, payload.limit)
                result["items"] = [{k: t[k] for k in ("id", "status", "created_at")} |
                    {'user_text': memory.redacted(session, profile, t['user_text'], at=t['created_at']),
                     "answer": memory.redacted(session, profile, t["answer"][:1500], at=t['created_at']), "answer_partial": len(t["answer"]) > 1500,
                     "workout_proposals": [workout_proposals.brief(p) for p in t["workout_proposals"]],
                     "questions": t["questions"]} for t in result["items"]]
                return result
            if name == "read_message":
                row = store.owned(session, store.CoachTurn, profile, payload.turn_id)
                end = payload.offset + payload.limit
                return {"id": row.id, "user_text": memory.redacted(session, profile, row.user_text, at=row.created_at), "status": row.status, "created_at": row.created_at,
                        "answer": memory.redacted(session, profile, row.answer[payload.offset:end], at=row.created_at), "next_offset": end if end < len(row.answer) else None,
                        "partial": end < len(row.answer)}
            if name == "search_memories":
                return store.memories(session, profile, **payload.model_dump())
            if name == "ask_questions":
                return {"questions": payload.model_dump()["questions"], "shown": True,
                        "note": "Questions affichées en cases avec une option Autre. Ne les répète pas dans le texte."}
            if name == "list_workouts":
                latest = select(WorkoutVersion.workout_id, func.max(WorkoutVersion.version).label("version")).group_by(
                    WorkoutVersion.workout_id).subquery()
                query = select(WorkoutVersion).join(Workout).join(latest,
                    (WorkoutVersion.workout_id == latest.c.workout_id) & (WorkoutVersion.version == latest.c.version))
                query = query.where(Workout.profile_id == profile,
                    WorkoutVersion.name.contains(payload.query, autoescape=True)).order_by(WorkoutVersion.created_at.desc(), Workout.id)
                return summaries(session, query, current.weight_kg, payload.offset, payload.limit)
            workouts._workout(session, profile, payload.workout_id)
            query = select(WorkoutVersion).where(WorkoutVersion.workout_id == payload.workout_id)
            if name == "list_versions":
                return summaries(session, query.order_by(WorkoutVersion.version.desc()), current.weight_kg, payload.offset, payload.limit)
            row = session.scalar(query.where(WorkoutVersion.version == payload.version)) if payload.version else workouts._latest(session, payload.workout_id)
            if row is None:
                raise workouts.WorkoutNotFound()
            data = workouts._out(row, current.weight_kg)
            # Les items contiennent tous les blocs et répétitions. Ne pas renvoyer aussi leur expansion.
            return {k: v for k, v in data.items() if k != "blocks"} | {"source": workout_link(data), "estimates": "Prévisions au poids actuel, pas une activité réalisée."}
    except catalog.CatalogTargetError as exc:
        return {'error': str(exc), 'valid': False}
    except ValidationError as exc:
        return {'error': 'Arguments invalides. Corriger les erreurs suivantes.',
                'issues': [{'path': list(e['loc']), 'message': e['msg']} for e in exc.errors(include_input=False, include_url=False)]}
    except constraints.RequestConstraintError as exc:
        return {'error': str(exc), 'code': 'request_constraints'}
    except (ValueError, TypeError, json.JSONDecodeError):
        return {"error": "Arguments invalides. Respectez le schéma de l'outil ; aucun champ profil n'est accepté."}
    except (ProfileNotFound, store.CoachNotFound, workouts.WorkoutNotFound, insights.service.RecordingNotFound):
        return {"error": "Donnée introuvable dans le profil actif."}
    except (store.CoachConflict, workouts.WorkoutConflict) as exc:
        return {'error': str(exc)}
    except SQLAlchemyError:
        # Les exceptions SQL peuvent contenir les paramètres : ne pas les sérialiser.
        return {"error": "Lecture impossible : base locale indisponible. Ne pas interpréter comme une absence de données."}
