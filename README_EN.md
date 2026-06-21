# GitHub Readme Stats - EdgeOne Pages Edition

English | [简体中文](README.md)

This project is based on the core code of [anuraghazra/github-readme-stats](https://github.com/anuraghazra/github-readme-stats), adapted for deployment on [Tencent EdgeOne Pages](https://pages.edgeone.ai).

The original project is deployed on Vercel. This version is adapted for EdgeOne Pages Cloud Functions and now includes a Go runtime implementation while keeping the same API interfaces and features.

## Features

- **Dynamic Statistics Cards**: Display GitHub or CNB data (commits, PRs, stars, etc.)
- **Presets Gallery**: Interactive dashboard showcase displaying multiple live cards side-by-side with one-click configuration
- **All-New Configuration Panel**: Premium web form layout supporting input debouncing and real-time Markdown/HTML code generation
- **Multiple Themes & Layouts**: Full support for themes, layouts (compact/normal), and custom styling parameters
- **EdgeOne Pages Optimized**: Adapted for EdgeOne Pages Cloud Functions and platform caching
- **Go Cloud Functions**: Uses a Go runtime backend for minimal cold starts and high performance
- **Original API Compatible**: Maintains the same query parameters and usage as the original project

## Interface Preview

![EdgeOne Pages Dashboard](./docs/static/dashboard.webp)

## Quick Start

### One-Click Deploy

You can deploy via [Tencent EdgeOne Pages](https://pages.edgeone.ai/en) with one click.

Click the button below to deploy:

[![Deploy with EdgeOne Pages](https://cdnstatic.tencentcs.com/edgeone/pages/deploy.svg)](https://console.cloud.tencent.com/edgeone/pages/new?repository-url=https%3A%2F%2Fgithub.com%2FMintimate%2Fgithub-readme-stats-eo)

See [Tencent EdgeOne Pages Documentation](https://pages.edgeone.ai/en/document/product-introduction) for more details.

> **Note**: GitHub requires `PAT_1`; public CNB data does not require a token. See [Environment Variables](#environment-variables).

### Manual Deployment

1. **Fork this repository**
2. **Configure environment variables** (see [Environment Variables](#environment-variables) below)
3. **Deploy to EdgeOne Pages**:
   - Follow the detailed deployment steps below

## Environment Variables

GitHub requires a token; public CNB data does not:

### Required Variables

- **`PAT_1`**: GitHub Personal Access Token
  - Used to call GitHub API to fetch user statistics
  - See [Get GitHub Token](#get-github-token-classic) below for how to obtain
  - Supports multiple tokens (`PAT_1`, `PAT_2`, `PAT_3`, etc.) to increase rate limits

### Optional Variables

- **`CNB_API_TOKEN`**: CNB access token
  - Public cards use CNB's web JSON endpoints and do not require a token
  - The token is only a fallback for future restricted Open API features and is never sent to public web endpoints
- **`PREFERRED_ORIGIN`**: Custom domain prefix
  - Used for API example URLs displayed on the homepage
  - Example: `https://github-readme-stats.mintimate.cn`
  - If not set, will automatically use the current access domain
- Other environment variables from the original project: [Original Project Documentation](https://github.com/anuraghazra/github-readme-stats#customization)

> **Note**: EdgeOne Pages loads environment variables after deployment. After changing environment variables, you need to trigger a new deployment for the changes to take effect.

## Cache Strategy

This project returns `Cache-Control` headers from the functions and configures Pages caching for the main card endpoints in `edgeone.json`:

- `/api`: cached for 1 day by default
- `/api/top-langs`: cached for 6 days by default
- `/api/pin`: cached for 10 days by default
- `/api/gist`: cached for 2 days by default
- `/api/wakatime`: cached for 1 day by default
- `/api/streak` and `/api/contribution-calendar`: cached for 12 hours by default
- `/api/recent-activity`: cached for 1 hour by default
- `/api/profile-summary`, `/api/repo-languages`, and `/api/org`: cached for 1 day by default

Status endpoints are not configured for platform caching, so PAT health and availability checks do not get cached for too long. High-traffic public instances can still place EdgeOne CDN / Cloudflare or another CDN layer in front of the custom domain for more cache control, purge support, and observability.

For example: I use EdgeOne site acceleration in front of EdgeOne Pages for extra CDN cache control:

![Configure origin site as EdgeOne Pages](./docs/static/CdnOriginToCdnConfig.webp)

Corresponding cache rules:

![Configured origin rules](./docs/static/OriginRulesConfig.webp)

## Go Cloud Functions

The Go entrypoint lives in `cloud-functions/index.go` and uses EdgeOne Pages Cloud Functions Framework mode. Application code lives under `cloud-functions/internal`, layered into `handler` (HTTP routing and responses), `service` (GitHub/WakaTime data access), and `card` (themes, shared styles, and SVG rendering), while covering `/`, `/api`, and `/api/*`. It currently covers:

- `/api` - GitHub Stats Card
- `/api/top-langs` - Top Languages Card
- `/api/pin` - Repository Pin Card
- `/api/gist` - Gist Card
- `/api/wakatime` - WakaTime Stats Card
- `/api/streak` - Contribution Streak Card
- `/api/profile-summary` - Developer Profile Summary Card
- `/api/contribution-calendar` - Contribution Calendar Card
- `/api/recent-activity` - Recent Public Activity Card
- `/api/repo-languages` - Repository Languages Card
- `/api/org` - GitHub Organization Stats Card
- `/api/status/up` - PAT availability check
- `/api/status/pat-info` - PAT status details

Go Cloud Functions is now the primary implementation, and Node Functions have been removed. The current Go version prioritizes core data and SVG output while continuing to match common themes, layouts, and display parameters from the original project.

### CNB Data Source

Add `platform=cnb` to a card URL to use CNB. GitHub remains the default, so existing URLs do not change.

```md
![CNB Stats](https://your-domain.example/api?platform=cnb&username=yourusername&show_icons=true)
![CNB Languages](https://your-domain.example/api/top-langs?platform=cnb&username=yourusername&layout=compact)
![CNB Repo](https://your-domain.example/api/pin?platform=cnb&username=yourusername&repo=group/repository)
```

CNB currently supports `/api`, `/api/top-langs`, `/api/pin`, `/api/streak`, `/api/profile-summary`, `/api/contribution-calendar`, `/api/recent-activity`, and `/api/repo-languages`. Gists and organization stats have no equivalent data source and remain GitHub-only. CNB exposes primary/secondary languages rather than byte counts; language cards are weighted by repository occurrence.

## Get GitHub Token (Classic)

1. Go to [Account -> Settings -> Developer Settings -> Personal access tokens -> Tokens (classic)](https://github.com/settings/tokens)
2. Click `Generate new token -> Generate new token (classic)`
3. Check the required permissions:
   - `repo`
   - `read:user`
4. Generate and copy the token (set `PAT_1` equal to this token value in EdgeOne Pages environment variables)

## Deploy to EdgeOne Pages

1. Log in to Tencent EdgeOne console and create a new Pages project
2. Select GitHub as the code source and link this repository; or directly download the repository and manually upload to EdgeOne Pages (will automatically trigger deployment)
3. Set `PAT_1` to the GitHub Token obtained in the previous step in the project's environment variables
4. (Optional) Set `PREFERRED_ORIGIN` environment variable to customize the URL prefix displayed on the homepage
5. Since EdgeOne Pages loads environment variables after deployment, you need to trigger another deployment after configuration for the variables to take effect

## Usage

After deployment, visit your EdgeOne Pages domain to see the usage documentation. The API interfaces are fully compatible with the original project.

### Available Endpoints

- `/api` - GitHub Stats Card
- `/api/top-langs` - Top Languages Card
- `/api/pin` - Repository Pin Card
- `/api/gist` - Gist Card
- `/api/wakatime` - WakaTime Stats Card
- `/api/streak` - Contribution Streak Card
- `/api/profile-summary` - Developer Profile Summary Card
- `/api/contribution-calendar` - Contribution Calendar Card
- `/api/recent-activity` - Recent Public Activity Card
- `/api/repo-languages` - Repository Languages Card
- `/api/org` - GitHub Organization Stats Card

For detailed parameters, please refer to the [original project documentation](https://github.com/anuraghazra/github-readme-stats/blob/master/readme.md).

## Example Cards

Copy the following code to your README file (replace with your domain and username):

```md
![GitHub Stats](https://your-project.pages.dev/api?username=yourusername&show_icons=true)
![Top Languages](https://your-project.pages.dev/api/top-langs?username=yourusername&layout=compact)
```

For more styling and parameter configurations (environment variables), please refer to the [original project documentation](https://github.com/anuraghazra/github-readme-stats#customization).

## Related Links

- [Original Repository](https://github.com/anuraghazra/github-readme-stats) - anuraghazra/github-readme-stats
- [EdgeOne Pages Documentation](https://pages.edgeone.ai/en/document/product-introduction)
- [EdgeOne Pages Console](https://console.cloud.tencent.com/edgeone/pages)

## License

This project is open-sourced under the MIT license based on the original project. See [LICENSE](LICENSE) file for details.
