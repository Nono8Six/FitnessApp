"""Liste fermée d'outils. Aucun identifiant de profil n'est accepté du modèle."""
import json
from datetime import datetime

from pydantic import Field, ValidationError
from sqlalchemy import func, select
from sqlalchemy.exc import SQLAlchemyError

from . import store
from . import workout_proposals
from ..storage.models import Workout, WorkoutSelection, WorkoutVersion
from ..training import workouts
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


class Proposal(Input):
    content: str = Field(min_length=1, max_length=500)
    quote: str = Field(min_length=1, max_length=500)


DEFINITIONS = {
    "get_profile": (Input, "Lire le profil actif, objectifs, poids, unités, sélection, date locale et données absentes."),
    "list_workouts": (Search, "Rechercher les séances existantes (dernière version), avec estimations backend. Pagination explicite."),
    "get_workout": (Detail, "Lire une séance ou une version précise : tous les blocs, origine, dates, estimations officielles."),
    "list_versions": (Versions, "Lister les versions datées d'une séance du profil, avec pagination."),
    "search_conversations": (Search, "Retrouver les conversations par leur titre ou le contenu de tous leurs échanges, même anciens."),
    "read_conversation": (History, "Lire les échanges précédents, datés, du plus récent vers les pages plus anciennes. Réponses incomplètes signalées."),
    "read_message": (MessageDetail, "Lire le texte complet d'une ancienne réponse par extraits paginés, après read_conversation."),
    "search_memories": (Search, "Lire les préférences durables explicitement enregistrées par l'utilisateur, avec dates."),
    "propose_memory": (Proposal, "Proposer une préférence durable UNIQUEMENT sur demande explicite de la retenir. Citer exactement le message actuel. N'enregistre rien : l'utilisateur doit confirmer dans l'interface."),
    "validate_workout": (workout_proposals.ProposalInput, "Valider un programme complet avant proposition : bornes, échauffement, retour au calme, objectif et niveau. Renvoie les erreurs précises et les prévisions Python. Corriger les erreurs avant de proposer."),
    "propose_workout": (workout_proposals.ProposalInput, "Proposer une séance structurée validée, jamais l'enregistrer. L'interface affiche Enregistrer, Modifier, Ignorer. Si workout_target est fourni par le contexte serveur, ajuster exactement cette version. Sinon target facultatif pour ajuster une version lue via get_workout. Pas de target pour une nouvelle séance."),
}


def definitions():
    return [{"type": "namespace", "name": "fitness", "description": "Données locales du seul profil actif. Lecture et propositions soumises à confirmation humaine.",
             "tools": [{"type": "function", "name": name, "description": description,
                        "parameters": model.model_json_schema(), "strict": False}
                       for name, (model, description) in DEFINITIONS.items()]}]


def profile_context(session, profile, simulation):
    selection = session.get(WorkoutSelection, profile)
    return {"profile": get_profile(session, profile).model_dump(),
        "local_date": datetime.now().astimezone().date().isoformat(),
        "timezone": str(datetime.now().astimezone().tzinfo),
        "selected_workout_id": selection.workout_id if selection else None,
        "settings": {"mode": "simulation" if simulation else "reel", "language": "fr", "distance_unit": "km",
                     "incline_unit": "%", "duration_unit": "seconds"},
        "activities": {"available": False, "reason": "L'historique des activités réalisées n'est pas encore implémenté. Bibliothèque = séances prévues, jamais réalisées."},
        "missing": ["fatigue actuelle sauf déclaration datée", "activité réelle", "résultats", "progression", "santé sauf déclaration explicite"],
        "memories": store.memories(session, profile, limit=8)}


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
        if name in {'validate_workout', 'propose_workout'}:
            with database.write() if name == 'propose_workout' else database.transaction() as session:
                current = get_profile(session, profile)
                if payload.target:
                    workout_proposals.snapshot(session, profile, payload.target)
                if name == 'validate_workout':
                    return {'valid': True, **workouts.preview(payload.workout, current.weight_kg)}
                if not turn_id or not call_id:
                    return {'error': 'Une réponse du coach et un appel identifiés sont requis.'}
                proposal = workout_proposals.propose(session, profile, turn_id, call_id, payload)
                return {'workout_proposal': proposal, 'saved': False, 'requires_user_confirmation': True}
        with database.transaction() as session:
            current = get_profile(session, profile)
            if name == "get_profile":
                return profile_context(session, profile, simulation)
            if name == "search_conversations":
                return store.conversations(session, profile, **payload.model_dump())
            if name == "read_conversation":
                result = store.turns(session, profile, payload.conversation_id, payload.offset, payload.limit)
                result["items"] = [{k: t[k] for k in ("id", "user_text", "status", "created_at")} |
                    {"answer": t["answer"][:1500], "answer_partial": len(t["answer"]) > 1500} for t in result["items"]]
                return result
            if name == "read_message":
                row = store.owned(session, store.CoachTurn, profile, payload.turn_id)
                end = payload.offset + payload.limit
                return {"id": row.id, "user_text": row.user_text, "status": row.status, "created_at": row.created_at,
                        "answer": row.answer[payload.offset:end], "next_offset": end if end < len(row.answer) else None,
                        "partial": end < len(row.answer)}
            if name == "search_memories":
                return store.memories(session, profile, **payload.model_dump())
            if name == "propose_memory":
                if payload.quote not in user_text:
                    return {"error": "La citation doit provenir exactement du message utilisateur actuel."}
                return {"proposal": payload.model_dump(), "saved": False, "requires_user_confirmation": True}
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
    except ValidationError as exc:
        return {'error': 'Arguments invalides. Corriger les erreurs suivantes.',
                'issues': [{'path': list(e['loc']), 'message': e['msg']} for e in exc.errors(include_input=False, include_url=False)]}
    except (ValueError, TypeError, json.JSONDecodeError):
        return {"error": "Arguments invalides. Respectez le schéma de l'outil ; aucun champ profil n'est accepté."}
    except (ProfileNotFound, store.CoachNotFound, workouts.WorkoutNotFound):
        return {"error": "Donnée introuvable dans le profil actif."}
    except (store.CoachConflict, workouts.WorkoutConflict) as exc:
        return {'error': str(exc)}
    except SQLAlchemyError:
        # Les exceptions SQL peuvent contenir les paramètres : ne pas les sérialiser.
        return {"error": "Lecture impossible : base locale indisponible. Ne pas interpréter comme une absence de données."}
