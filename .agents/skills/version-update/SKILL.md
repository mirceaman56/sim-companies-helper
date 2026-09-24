---
name: version-update
description: helps bump up the extension version when a new feature is implemented
---

When working on a feature branch, you should update the version number in the extension's manifest file to reflect the new changes. This ensures that users will receive the latest version with the implemented features.

Rules:
- patch version increase: for small bug fixes and minor changes that do not affect the overall functionality.
- minor version increase: for adding new features or significant improvements that are backward-compatible.
- major version increase: never for now, we are still pre-release.
