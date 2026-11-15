# Coding standards

1. New shell scripts start with a short comment describing their purpose, plus the related issue reference where there is one. Scripts without a related issue do not need an issue number.
2. Extract nontrivial GitHub Actions `run:` logic (branching, failure handling, exit-status propagation) into testable scripts under `scripts/`, with tests under `scripts/__tests__/`.
3. Keep build-time-only code out of frontend runtime source directories unless there is a justified architectural reason.
