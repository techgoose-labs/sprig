# dog-profile-card — jank

No animation: `document.getAnimations()` is `[]` at settle, and the card has no hover or transition classes. No live run was needed and nothing is animated, so there is no motion.json or filmstrip.

## Static lint findings
- CSS: none (css/dog-profile-card.rules.css has no transition/keyframe hits).
- JS: none. The card is a static string template inside `renderDetail`.
