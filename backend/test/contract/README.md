# Contract tests

Reserved per the plan's §11 backend layout (`backend/test/{integration,contract,fixtures}`).

Phase 1 ships no business endpoints, so there is nothing to contract-test yet.
This directory exists now so Phase 2 has a place to drop request/response
contract tests (e.g. asserting `/auth/*`, `/bootstrap` response shapes
against their OpenAPI schema) without having to invent the convention then.
