# Architecture documents

The architecture baseline originated in `MoniKey_v1_3_Architecture_with_Obsidian.zip` (SHA-256 `93da7ad300992e2933970ba208a7748f06a4110533842f970e5932130801f730`) and is maintained in this repository. The approved design describes the target application; the current implementation is a mock-backed frontend through Milestone 4.9. The backend, database, integration, CI, containers, and cluster state have not been implemented or verified here.

Use [ROADMAP.md](ROADMAP.md#current-progress-and-next-gate) for the current progress snapshot. Treat milestone reports as dated evidence for their own scope, not as claims about later work or deployment.

- [TLD](TLD.md)
- [ADRs](ADR.md)
- [Master Plan](MASTER_PLAN.md)
- [Roadmap](ROADMAP.md)
- [AI Agent Playbook](AI_AGENT_PLAYBOOK.md)
- [Frontend setup checklist](FRONTEND_SETUP.md)
- [Obsidian guide](OBSIDIAN_GUIDE.md)

The application repository remains authoritative for application code and accepted architecture. The separate existing `homelab-gitops` repository remains authoritative for Kubernetes desired state.
