# AGENTS-phase5.md — Phase 5: DNS Cutover

> Rename to AGENTS.md when Phase 5 begins.
> Prerequisite: All previous phases complete, site verified on preview URL.
> WARNING: This phase modifies live DNS. Proceed carefully.

---

## Phase 5 Goal

Switch production traffic from AWS EC2 to Cloudflare.
Zero data loss. DNS propagation window: 5–30 minutes.

---

## Pre-Cutover Checklist (complete ALL before touching DNS)

- [ ] Preview URL (tripcanvas.pages.dev) passes full QA
- [ ] All posts verified in Payload admin
- [ ] All images loading from R2
- [ ] Locale switching works across all 4 subdomains
- [ ] Redirects tested for old WP URL formats
- [ ] Payload CMS admin accessible and writers have accounts
- [ ] EC2 instance has a snapshot/AMI taken (rollback option)
- [ ] Cloudflare zone is active for tripcanvas.co
- [ ] TTL on existing DNS records reduced to 60 seconds (do this 24h before)

---

## Task 1 — Final content sync

Run a delta sync to catch any posts published on WordPress since Phase 3:

```bash
# On EC2: export only posts modified after your Phase 3 migration date
wp post list --post_status=publish --after="2024-XX-XX" --format=json

# Run migration scripts again with --delta flag
node scripts/migration/migrate-posts.js --delta
node scripts/migration/migrate-media.js --delta
```

Commit: `chore(cutover): final content delta sync`

---

## Task 2 — Put WordPress in read-only mode

On EC2, add to WordPress `functions.php` or via plugin:
```php
// Disable new post creation during cutover window
add_action('admin_init', function() {
  if (current_user_can('editor') && !current_user_can('administrator')) {
    wp_die('Site is in maintenance mode. Please check back shortly.');
  }
});
```

Or simply: Settings → Reading → put site in maintenance mode.

---

## Task 3 — Update Cloudflare DNS

In Cloudflare DNS dashboard for tripcanvas.co:

1. For each record, change from EC2 IP to Cloudflare Pages:

```
# Remove these A records pointing to EC2:
tripcanvas.co         A  [EC2-IP]
www.tripcanvas.co     A  [EC2-IP]
malaysia.tripcanvas.co A  [EC2-IP]
indonesia.tripcanvas.co A [EC2-IP]
thailand.tripcanvas.co  A [EC2-IP]

# Add these CNAME records pointing to Pages:
tripcanvas.co         CNAME  tripcanvas.pages.dev
www                   CNAME  tripcanvas.pages.dev
malaysia              CNAME  tripcanvas.pages.dev
indonesia             CNAME  tripcanvas.pages.dev
thailand              CNAME  tripcanvas.pages.dev
```

2. Enable Cloudflare proxy (orange cloud) on all records.
3. Set up Custom Domains in Cloudflare Pages dashboard for each subdomain.

---

## Task 4 — Verify live traffic

After DNS propagates (check with `dig tripcanvas.co`):

```bash
# Verify each subdomain
curl -I https://tripcanvas.co
curl -I https://malaysia.tripcanvas.co
curl -I https://indonesia.tripcanvas.co
curl -I https://thailand.tripcanvas.co

# Check locale header is set correctly
curl -I https://malaysia.tripcanvas.co | grep X-TC-Locale

# Check a known post URL
curl -I https://tripcanvas.co/best-beaches-langkawi
```

Monitor Cloudflare Analytics for 404 spikes.

---

## Task 5 — Post-cutover monitoring (48 hours)

Set up Cloudflare alerts:
- Error rate > 1% → notify
- Origin errors → notify

Check daily:
- [ ] Top 404s in Cloudflare Analytics → add to `_redirects` if needed
- [ ] Image loading errors
- [ ] CMS admin accessible for writers
- [ ] D1 not hitting storage limits

---

## Task 6 — Decommission EC2 (after 2 weeks)

Only after 2 stable weeks:
1. Take final EC2 snapshot
2. Stop (not terminate) EC2 instance
3. After 2 more weeks with no issues: terminate instance
4. Cancel any unused AWS services (RDS if separate, Elastic IPs)

Commit: `chore: cutover complete, ec2 decommissioned`

---

## Phase 5 Complete — Migration Done!

Final steps:
1. Update CLAUDE.md — check off all phases
2. Tag the repo: `git tag v1.0.0-migration-complete`
3. Archive migration scripts (keep in repo, don't delete)
4. Brief your writers on the new Payload CMS admin UI
5. Final commit: `chore: migration complete — tripcanvas on cloudflare`
