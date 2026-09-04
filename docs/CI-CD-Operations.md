# CI/CD Operations Guide for Monikey

This document describes the Continuous Integration and Continuous Deployment (CI/CD) setup for the Monikey application.

## Overview

Monikey uses GitHub Actions for automated testing, building, and scanning. The CI/CD pipeline ensures code quality, security, and operational readiness before deployment.

## CI/CD Pipeline Structure

### Main Workflow: `.github/workflows/ci.yaml`

The primary CI/CD workflow includes:

1. **Frontend Quality Checks**
   - Linting (ESLint via oxlint)
   - TypeScript type checking
   - Unit tests (Vitest)
   - Production build

2. **Backend Quality Checks**
   - Linting (oxlint)
   - TypeScript type checking
   - Unit tests (Vitest)

3. **Database Integration Tests**
   - PostgreSQL 16 service provisioning
   - Prisma migration deployment
   - Full integration test suite with live database

4. **Docker Build & Scanning**
   - Backend image build
   - Frontend/web image build
   - Trivy vulnerability scanning (CRITICAL and HIGH severity)
   - SARIF report upload to GitHub Security tab

5. **OpenAPI Contract Verification**
   - Full stack startup
   - OpenAPI spec generation
   - Baseline comparison (if baseline exists)

6. **End-to-End Testing**
   - Full Docker Compose stack startup
   - Playwright E2E test suite
   - Playwright report generation

7. **Security Checks**
   - Secret scanning (TruffleHog)
   - VITE environment variable validation
   - .gitignore verification
   - Common secret pattern detection

### Secondary Workflows

#### CodeQL Analysis (`.github/workflows/codeql.yaml`)

- Runs on pushes to main/feature branches and pull requests
- Daily scheduled analysis at 2 AM UTC
- Detects security and quality issues
- Reports to GitHub Security tab

#### Dependabot Configuration (`.github/dependabot.yml`)

Automated dependency updates for:
- Frontend npm packages (weekly, Mondays at 04:00)
- Backend npm packages (weekly, Mondays at 05:00)
- Docker images (weekly, Mondays at 06:00)
- GitHub Actions (weekly, Mondays at 07:00)

Opens pull requests for dependency updates with automatic reviews.

## Test Environment Configuration

The CI environment uses standard configuration to avoid dependency on specific secrets:

```env
NODE_ENV=production
DATABASE_URL=postgresql://monikey:test-password@localhost:5432/monikey
INTEGRATIONS_MODE=stub
# All external providers use stub implementations in CI
```

### PostgreSQL Service

- Image: `postgres:16-alpine`
- Database: `monikey`
- User: `monikey`
- Port: `5432` (localhost)
- Health check: Every 10s, timeout 5s, 5 retries

## Running Locally

### Prerequisites

- Docker and Docker Compose
- Node.js 24+
- PostgreSQL client tools (optional, for direct DB access)

### Full Stack Test Locally

```bash
# 1. Start PostgreSQL
docker run -d \
  --name test-db \
  -e POSTGRES_DB=monikey \
  -e POSTGRES_USER=monikey \
  -e POSTGRES_PASSWORD=test-password \
  -p 5432:5432 \
  postgres:16-alpine

# 2. Wait for DB to be ready
sleep 5

# 3. Run migrations
cd backend
DATABASE_URL="postgresql://monikey:test-password@localhost:5432/monikey" \
  npx prisma migrate deploy

# 4. Run tests
npm run test

# 5. Stop DB
docker stop test-db && docker rm test-db
```

### Docker Image Build

```bash
# Build all images
docker compose build

# Build specific service
docker compose build backend
docker compose build web

# Build without cache
docker compose build --no-cache
```

### Run Full Stack

```bash
# Start all services
docker compose up -d

# Wait for services to be healthy
docker compose ps

# Check logs
docker compose logs -f api

# Stop and clean up
docker compose down -v
```

### Run E2E Tests Locally

```bash
# Install Playwright browsers
npm run test:e2e:install

# Start the full stack
docker compose up -d

# Run tests
npm run test:e2e

# View results
npx playwright show-report

# Clean up
docker compose down
```

## Observability

### Optional Observability Stack

Enable Prometheus and Grafana monitoring:

```bash
# Start with observability profile
docker compose -f compose.yaml -f compose.observability.yaml up -d

# Access services:
# - Prometheus: http://localhost:9090
# - Grafana: http://localhost:3001 (admin/admin)
```

Configuration files:
- `docker/prometheus.yml` - Prometheus scrape config
- `docker/grafana-provisioning/` - Grafana dashboards and datasources

## Troubleshooting

### CI Fails Locally but Passes on GitHub

1. Check Docker version (use latest)
2. Verify sufficient disk space for Docker images
3. Clear Docker build cache: `docker system prune -a`
4. Check .env file is not checked in
5. Verify node_modules are not checked in

### PostgreSQL Migration Fails

1. Ensure PostgreSQL service is healthy: `docker compose ps db`
2. Check database connectivity:
   ```bash
   docker compose exec db psql -U monikey -d monikey -c "SELECT version();"
   ```
3. Verify DATABASE_URL is correct
4. Check Prisma schema: `ls backend/prisma/schema.prisma`

### Docker Build Fails with Network Error

1. Check Docker network: `docker network ls`
2. Restart Docker daemon
3. Build with no cache: `docker compose build --no-cache`
4. Check npm registry: `npm config get registry`

### Tests Timeout

1. Increase test timeout in `vitest.config.ts`
2. Check system resources: `docker stats`
3. Check PostgreSQL performance: `docker compose logs db | grep slow`

## Security Practices

### Secrets Management

- Never commit `.env` or `.env.local`
- `.gitignore` includes `.env*` patterns
- All secrets in CI are GitHub Secrets
- Use `VITE_*` only for non-sensitive frontend values

### Dependency Scanning

- Dependabot scans for vulnerable packages
- GitHub Actions fail on HIGH/CRITICAL vulnerabilities
- Review and update dependencies regularly
- Monitor GitHub Security Advisories

### Container Scanning

- Trivy scans Docker images for vulnerabilities
- SARIF reports uploaded to Security tab
- Base images: `node:24-alpine`, `postgres:16-alpine`, `nginx:1.27-alpine`
- Production images run as non-root user

### Code Quality

- ESLint/oxlint for style consistency
- TypeScript strict mode for type safety
- Security headers in Nginx configuration
- CORS validation in API

## Metrics and Monitoring

### Key Metrics

- Build time (target: <5 minutes per job)
- Test execution time (target: <2 minutes per suite)
- Code coverage (track over time)
- Vulnerability count (target: 0 HIGH/CRITICAL)

### CI Logs

Access CI logs in GitHub:
1. Go to Actions tab
2. Select workflow run
3. View job logs
4. Download artifacts

### Artifacts

Each workflow run produces:
- `frontend-dist` - Frontend build output (1 day retention)
- `openapi-spec` - Generated OpenAPI spec (30 day retention)
- `playwright-report` - E2E test report (7 day retention)
- `trivy-*.sarif` - Vulnerability scan results

## Database Migrations

### Managing Migrations

```bash
# Create new migration
cd backend
DATABASE_URL="postgresql://..." npx prisma migrate dev --name "descriptive_name"

# Deploy to environment
DATABASE_URL="postgresql://..." npx prisma migrate deploy

# Reset database (development only!)
DATABASE_URL="postgresql://..." npx prisma migrate reset
```

### Migration Testing in CI

The CI pipeline automatically:
1. Provisions fresh PostgreSQL instance
2. Deploys all pending migrations
3. Runs full test suite against migrated schema
4. Verifies rollback capability

## Performance Optimization

### Build Caching

GitHub Actions uses Build Kit cache for Docker images:
- Cache layers across builds
- Significant speedup on subsequent builds
- Separate caches for frontend and backend

### Dependency Caching

Node.js dependencies cached per workflow:
- `package-lock.json` included in cache key
- Changes to lock file invalidate cache
- Reduces npm install time

## Release Workflow

1. **Code Review**: All changes reviewed before merge
2. **CI Pass**: All checks pass on target branch
3. **Manual Approval**: Release engineer approves
4. **Deploy**: Tag creation triggers deployment workflow
5. **Monitoring**: Post-deploy health checks and metrics

## Emergency Procedures

### CI Broken - Need to Deploy

1. **Diagnose Issue**
   ```bash
   # Check workflow logs
   # Run failing test locally
   npm run test
   docker compose build
   ```

2. **Fix in Feature Branch**
   - Create fix commit
   - Push to branch
   - Wait for CI to pass

3. **Hotfix to Main**
   - Merge to main via PR
   - Monitor CI results
   - Verify deployment

### Rollback

```bash
# Identify good commit
git log --oneline main | head -5

# Deploy previous version
git tag v1.2.3-rollback <commit-hash>
# Deployment workflow triggers
```

## Checklists

### Before Deploying to Production

- [ ] All CI checks pass
- [ ] Code review approved
- [ ] Database migrations tested
- [ ] No HIGH/CRITICAL vulnerabilities
- [ ] E2E tests pass
- [ ] Observability metrics available
- [ ] Rollback plan documented

### After Deploying to Production

- [ ] Monitor error rates (target: <0.1%)
- [ ] Check database performance
- [ ] Verify user-reported issues
- [ ] Review security logs
- [ ] Document any incidents

## References

- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [PostgreSQL Backup and Recovery](https://www.postgresql.org/docs/current/backup.html)
- [Docker Compose Documentation](https://docs.docker.com/compose/)
- [Trivy Security Scanning](https://github.com/aquasecurity/trivy)
- [CodeQL Documentation](https://codeql.github.com/)
