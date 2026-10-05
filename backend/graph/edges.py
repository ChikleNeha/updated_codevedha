from graph.state import TutorState


def route_by_intent(state: TutorState) -> str:
    intent = state.get("intent", "unknown")
    return intent if intent in ("tutor", "quiz", "lesson") else "tutor"
