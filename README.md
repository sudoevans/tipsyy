# Tipsy Theoryy

Tipsy Theoryy is a mobile-first alcohol delivery storefront with a PostgreSQL-backed catalog, persistent carts, stock reservations, guest checkout, Safaricom M-Pesa STK Push payments, passwordless phone authentication, customer accounts, order tracking, and admin/rider API foundations.

See [the backend setup and operations guide](docs/backend.md) before starting local services or configuring external providers.

## Quick start

```bash
docker compose up -d postgres
npm run db:setup
npm run dev
```

The application intentionally fails closed for M-Pesa, OTP, Google OAuth, and internal worker calls until their real credentials are configured in `.env.local` from `.env.example`.

## TipsyAdmin

TipsyAdmin is the operational dashboard for Tipsy Theoryy. It uses Next.js 16, React 19, TypeScript, Tailwind CSS, and PostgreSQL-backed API routes.

## Overview

TipsyAdmin provides the UI components and layouts needed to manage the platform. It's built on:

- Next.js 16.x
- React 19
- TypeScript
- Tailwind CSS V4

### TipsyAdmin resources

- [✨ Visit Website](https://tailadmin.com)
- [📄 Documentation](https://tailadmin.com/docs)
- [⬇️ Download](https://tailadmin.com/download)
- [🖌️ Figma Design File (Community Edition)](https://www.figma.com/community/file/1463141366275764364)
- [⚡ Get PRO Version](https://tailadmin.com/pricing)

### Demos

- [Free Version](https://nextjs-free-demo.tailadmin.com)
- [Pro Version](https://nextjs-demo.tailadmin.com)

### Other Versions

- [Next.js Version](https://github.com/TailAdmin/free-nextjs-admin-dashboard)
- [React.js Version](https://github.com/TailAdmin/free-react-tailwind-admin-dashboard)
- [Vue.js Version](https://github.com/TailAdmin/vue-tailwind-admin-dashboard)
- [Angular Version](https://github.com/TailAdmin/free-angular-tailwind-dashboard)
- [Laravel Version](https://github.com/TailAdmin/tailadmin-laravel)

## Installation

### Prerequisites

To get started with TipsyAdmin, ensure you have the following prerequisites installed and set up:

- Node.js 20.x or later

### Cloning the Repository

Clone the repository using the following command:

```bash
git clone <your-tipsy-theoryy-repository-url>
```

> Windows Users: place the repository near the root of your drive if you face issues while cloning.

1. Install dependencies:

   ```bash
   npm install
   # or
   yarn install
   ```

   > Use `--legacy-peer-deps` flag if you face peer-dependency error during installation.

2. Start the development server:

   ```bash
   npm run dev
   # or
   yarn dev
   ```

## Components

TipsyAdmin is the operational dashboard for the Tipsy Theoryy platform. It includes:

- Sophisticated and accessible sidebar
- Data visualization components
- Profile management and custom 404 page
- Tables and Charts(Line and Bar)
- Authentication forms and input elements
- Alerts, Dropdowns, Modals, Buttons and more
- Can't forget Dark Mode 🕶️

All components are built with React and styled using Tailwind CSS for easy customization.

## Feature Comparison

### Free Version

- 1 Unique Dashboard
- 30+ dashboard components
- 50+ UI elements
- Basic Figma design files
- Community support

### Pro Version

- 7 Unique Dashboards: Ecommerce, Analytics, Marketing, CRM, Stocks, SaaS, Logistics, AI, Sales, Finance (more coming soon)
- 500+ dashboard components and UI elements
- Complete Figma design file
- Email support

For platform configuration, use the Settings area within TipsyAdmin.

## Changelog

### Version 2.4.0 - [September 13, 2026]

- Added Internationalization (Multi Language) support.
- Updated complete template styles to support RTL.
- Added Yearly View into calendar page.
- Updated `maplibre-gl` implementation with `react-map-gl`.
- Added new requested components and fixed noted accessibility issues.
- Updated project structure and component compositions for easy adaption.
- Added AGENTS.md to easily work with AI Agents.
- Updated all the packages and libraries to the latest versions. Also removed unused packages.

### Version 2.3.1 - [May 23, 2026]

- Added AI Settings page to configure models, keys, and token limits.
- Added Maps page with MapLibre GL, Leaflet, and iframe styles.
- Added Vector Maps page powered by AmCharts 5 geodata (World & USA).
- Added Radar Charts page with 3 unique formats.
- Added Radial Progress Charts page featuring 4 custom layout templates.
- Introduced new Bar Charts Five & Six and Pie Charts Four & Five.

### Version 2.3.0 - [April 28, 2026]

- **New Feature**: Added **AI Dashboard** with token usage and revenue tracking.
- **New Feature**: Added **Sales Dashboard** with retention and multi-channel analytics.
- **New Feature**: Added **Finance Dashboard** with cashflow and balance management.
- **New Feature**: Introduced **6 New Layout variations** for improved UI flexibility.
- **Enhancement**: Integrated **Advanced Data Visualization** with 7+ new chart types.

### Version 2.2.3 - [March 15, 2026]

- update ESLint configuration and dependencies; upgrade Next.js to version 16.1.6

### Version 2.2.2 - [December 30, 2025]

- Fixed date picker positioning and functionality in Statistics Chart.

### Version 2.1.0 - [November 15, 2025]

- Updated to Next.js 16.x
- Fixed all reported minor bugs

### Version 2.0.2 - [March 25, 2025]

- Upgraded to Next.js 16.x for [CVE-2025-29927](https://nextjs.org/blog/cve-2025-29927) concerns
- Included overrides vectormap for packages to prevent peer dependency errors during installation.
- Migrated from react-flatpickr to flatpickr package for React 19 support

### Version 2.0.1 - [February 27, 2025]

#### Update Overview

- Upgraded to Tailwind CSS v4 for better performance and efficiency.
- Updated class usage to match the latest syntax and features.
- Replaced deprecated class and optimized styles.

#### Next Steps

- Run npm install or yarn install to update dependencies.
- Check for any style changes or compatibility issues.
- Refer to the Tailwind CSS v4 [Migration Guide](https://tailwindcss.com/docs/upgrade-guide) on this release. if needed.
- This update keeps the project up to date with the latest Tailwind improvements. 🚀

### v2.0.0 (February 2025)

A major update focused on Next.js 16 implementation and comprehensive redesign.

#### Major Improvements

- Complete redesign using Next.js 16 App Router and React Server Components
- Enhanced user interface with Next.js-optimized components
- Improved responsiveness and accessibility
- New features including collapsible sidebar, chat screens, and calendar
- Redesigned authentication using Next.js App Router and server actions
- Updated data visualization using ApexCharts for React

#### Breaking Changes

- Migrated from Next.js 14 to Next.js 16
- Chart components now use ApexCharts for React
- Authentication flow updated to use Server Actions and middleware

[Read more](https://tailadmin.com/docs/update-logs/nextjs) on this release.

### v1.3.4 (July 01, 2024)

- Fixed JSvectormap rendering issues

### v1.3.3 (June 20, 2024)

- Fixed build error related to Loader component

### v1.3.2 (June 19, 2024)

- Added ClickOutside component for dropdown menus
- Refactored sidebar components
- Updated Jsvectormap package

### v1.3.1 (Feb 12, 2024)

- Fixed layout naming consistency
- Updated styles

### v1.3.0 (Feb 05, 2024)

- Upgraded to Next.js 14
- Added Flatpickr integration
- Improved form elements
- Enhanced multiselect functionality
- Added default layout component

## License

TailAdmin Next.js Free Version is released under the MIT License.

## Support

If you find this project helpful, please consider giving it a star on GitHub. Your support helps us continue developing and maintaining this template.
# Admin access

The operations portal uses a dedicated username/password session at `/admin/login`. It does not use customer OTP or Google authentication and has no public registration flow.

Create or reset the initial full-access administrator from the command line after running migrations. The script loads `.env` / `.env.local`; it stores only a scrypt password hash in the database and does not run automatically when the app starts or deploys.

```dotenv filename=".env"
DATABASE_URL=postgresql://<production-db-connection>
TIPSY_ADMIN_USERNAME=superadmin
TIPSY_ADMIN_DISPLAY_NAME=Super Admin
TIPSY_ADMIN_PASSWORD=<unique-password-at-least-12-characters>
```

```sh
npm run admin:create
```

Use a direct PostgreSQL connection for this one-time CLI command; Cloudflare Hyperdrive bindings are available to the deployed Worker, not to this local script. Remove `TIPSY_ADMIN_PASSWORD` from the local environment file after creating the account. Then sign in at `/admin/login` and use the Staff section to add other admin/support accounts.
