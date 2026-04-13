# URL Structure Map

## Main Sites (Subdomains)

| Subdomain | Locale | WordPress Path | Database | Permalink Structure |
|----------|--------|---------------|----------|---------------------|
| tripcanvas.co | en | /var/www/html/tripcanvas.co | wordpress_main | /%postname%/ |
| malaysia.tripcanvas.co | my | /var/www/html/malaysia.tripcanvas.co/public | malaysia | /%category%/%postname%/ |
| indonesia.tripcanvas.co | id | /var/www/html/indonesia.tripcanvas.co/public | wordpress | /%category%/%postname%/ |
| thailand.tripcanvas.co | th | /var/www/html/thailand.tripcanvas.co/public | thailand | /%category%/%postname%/ |

## Multisite Subsites (Path-based)

### malaysia.tripcanvas.co
- / (main site)
- /zh/ (Chinese translated)
- /shop/ (shop section)

### indonesia.tripcanvas.co
- / (main site)
- /id/ (Indonesian, default)
- /flights/
- /giveaway/
- /business/
- /zh/ (Chinese translated)

### thailand.tripcanvas.co
- / (main site)
- /zh/ (Chinese translated)
- /id/ (Indonesian translated)

## Media Storage

- All media stored in wp-content/uploads/
- Organized by year/month
- Total size: ~78GB across all 3 localized sites
- Media items: 60,000+

## Notes

- Each subdomain is a separate WordPress multisite network
- Language variants handled via WPML within each multisite
- Main EN site (tripcanvas.co) has no multilanguage setup
- POST COUNT:
  - EN: 1 post
  - MY: 132 posts
  - ID: 461 posts  
  - TH: 277 posts
