---
name: Package mirror gaps
description: Handling npm dependencies unavailable in the Replit package mirror.
---

When an npm install fails because Replit's package mirror returns 404 for a transitive tarball, first identify which direct or transitive parent requires it. Updating a stale parent or removing an unused development-only parent can eliminate the obsolete dependency cleanly.

**Why:** The mirror may not have every old transitive tarball in a project's lockfile; trying alternate package registries would bypass Replit's package firewall.

**How to apply:** Keep the project registry/firewall in place. Check the dependency chain, then update a compatible parent or remove a genuinely unused dependency and regenerate the lockfile.
