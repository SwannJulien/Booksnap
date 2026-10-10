---
name: Replit publish target synchronization
description: Align the workspace deployment target with the publishing configuration before a new production build.
---

When changing Booksnap's deployment model, update the `[deployment] deploymentTarget` in `.replit` through Replit's validated replacement flow as well as calling `deployConfig`. Do not assume a successful `deployConfig` response means the next Publish uses the new target; confirm `.replit` matches the user's choice.

**Why:** a later Publish continued using the old `cloudrun` target even though the deployment callback had accepted the VM configuration.

**How to apply:** before prompting the user to publish, inspect `.replit`, verify its target and build/run commands, and confirm the corrected build succeeds locally.
