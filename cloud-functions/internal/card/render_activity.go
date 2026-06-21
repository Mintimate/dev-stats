package card

import (
	"fmt"
	"github-readme-stats-eo/cloud-functions/internal/service"
	"html"
	"math"
	"strconv"
	"strings"
	"time"
)

func RenderWakatimeCard(langs []service.WakatimeLanguage, opts Options, count int, hide []string) string {
	if count <= 0 || count > 10 {
		count = 5
	}
	hidden := setFromStrings(hide)
	filtered := make([]service.WakatimeLanguage, 0, len(langs))
	for _, lang := range langs {
		if hidden[strings.ToLower(lang.Name)] || hidden[lang.Name] {
			continue
		}
		filtered = append(filtered, lang)
		if len(filtered) == count {
			break
		}
	}
	title := opts.CustomTitle
	if title == "" {
		title = "WakaTime Stats"
	}
	rows := strings.Builder{}
	for i, lang := range filtered {
		y := 66 + i*34
		color := colorForName(lang.Name)
		label := fmt.Sprintf("%.1f%%", lang.Percent)
		if lang.Text != "" {
			label = lang.Text
		}
		barWidth := 180.0
		rows.WriteString(fmt.Sprintf(`<g transform="translate(25,%d)"><circle cx="0" cy="-4" r="5" fill="%s"/><text x="16" class="lang-name">%s</text><text x="185" class="muted">%s</text><rect x="0" y="10" width="270" height="8" rx="5" fill="#ddd" opacity=".35"/><rect x="0" y="10" width="%.1f" height="8" rx="5" fill="%s"/></g>`, y, color, html.EscapeString(lang.Name), html.EscapeString(label), barWidth*lang.Percent/100, color))
	}
	height := max(120, 75+len(filtered)*34)
	return SVG(495, height, opts, title, rows.String(), "")
}

func RenderStreakCard(data service.StreakData, opts Options) string {
	title := opts.CustomTitle
	if title == "" {
		title = data.Name + "'s Contribution Streak"
	}
	offset := cardContentOffset(opts)
	height := 195 + offset
	currentRange := formatDateRange(data.CurrentStart, data.CurrentEnd)
	longestRange := formatDateRange(data.LongestStart, data.LongestEnd)
	body := fmt.Sprintf(`
<g transform="translate(0,%d)">
  <line x1="165" y1="72" x2="165" y2="145" stroke="%s" opacity=".18"/>
  <line x1="330" y1="72" x2="330" y2="145" stroke="%s" opacity=".18"/>
  %s%s%s
</g>`, offset, opts.TextColor, opts.TextColor,
		streakMetric(82, "Current Streak", data.Current, "days", currentRange, opts),
		streakMetric(247, "Longest Streak", data.Longest, "days", longestRange, opts),
		streakMetric(412, "Total Contributions", data.Total, "", fmt.Sprintf("%d active days", data.ContributionDays), opts))
	return SVG(495, max(150, height), opts, title, body, "")
}

func streakMetric(cx int, label string, value int, unit, detail string, opts Options) string {
	valueText := formatIntWithCommas(value)
	if unit != "" {
		valueText += " " + unit
	}
	return fmt.Sprintf(`<g text-anchor="middle"><text x="%d" y="88" class="metric-value">%s</text><text x="%d" y="112" class="label">%s</text><text x="%d" y="134" class="muted">%s</text><circle cx="%d" cy="55" r="5" fill="%s"/></g>`, cx, html.EscapeString(valueText), cx, html.EscapeString(label), cx, html.EscapeString(defaultString(detail, "No active streak")), cx, opts.IconColor)
}

func RenderProfileSummaryCard(data service.ProfileSummaryData, opts Options) string {
	title := opts.CustomTitle
	if title == "" {
		title = data.Name + "'s Profile Summary"
	}
	offset := cardContentOffset(opts)
	years := make([]string, 0, minInt(len(data.ActiveYears), 6))
	for i, year := range data.ActiveYears {
		if i == 6 {
			break
		}
		years = append(years, strconv.Itoa(year))
	}
	memberSince := shortYear(data.MemberSince)
	platform := data.Platform
	if platform == "" {
		platform = "GitHub"
	}
	body := fmt.Sprintf(`<g transform="translate(0,%d)">
<text x="25" y="66" class="muted">@%s · %s member since %s</text>
%s%s%s%s%s%s%s%s
		<text x="25" y="214" class="muted">Active years: %s</text>
</g>`, offset, html.EscapeString(data.Login), html.EscapeString(platform), memberSince,
		summaryMetric(25, 94, "Repositories", data.Repositories, opts), summaryMetric(145, 94, "Followers", data.Followers, opts),
		summaryMetric(265, 94, "Stars earned", data.TotalStars, opts), summaryMetric(385, 94, "Forks", data.TotalForks, opts),
		summaryMetric(25, 150, "Commits (year)", data.TotalCommits, opts), summaryMetric(145, 150, "Pull requests", data.TotalPRs, opts),
		summaryMetric(265, 150, "Issues", data.TotalIssues, opts), summaryMetric(385, 150, "Gists", data.Gists, opts), strings.Join(years, " · "))
	return SVG(495, max(190, 245+offset), opts, title, body, "")
}

func summaryMetric(x, y int, label string, value int, opts Options) string {
	return fmt.Sprintf(`<g transform="translate(%d,%d)"><rect width="100" height="42" rx="7" fill="%s" opacity=".07"/><text x="10" y="18" class="metric-small">%s</text><text x="10" y="34" class="micro">%s</text></g>`, x, y, opts.IconColor, html.EscapeString(formatNumber(value)), html.EscapeString(label))
}

func RenderContributionCalendarCard(name string, days []service.ContributionDay, opts Options) string {
	title := opts.CustomTitle
	if title == "" {
		title = name + "'s Contribution Calendar"
	}
	offset := cardContentOffset(opts)
	maxCount, total := 0, 0
	for _, day := range days {
		total += day.Count
		if day.Count > maxCount {
			maxCount = day.Count
		}
	}
	var cells, months strings.Builder
	lastMonth := time.Month(0)
	for i, day := range days {
		date, err := time.Parse("2006-01-02", day.Date)
		if err != nil {
			continue
		}
		week := i / 7
		x, y := 25+week*13, 64+int(date.Weekday())*13+offset
		level := contributionLevel(day.Count, maxCount)
		opacity := []float64{0.08, 0.3, 0.5, 0.72, 1}[level]
		cells.WriteString(fmt.Sprintf(`<rect x="%d" y="%d" width="10" height="10" rx="2" fill="%s" opacity="%.2f"><title>%s: %d contributions</title></rect>`, x, y, opts.IconColor, opacity, day.Date, day.Count))
		if date.Day() <= 7 && date.Month() != lastMonth && week < 51 {
			months.WriteString(fmt.Sprintf(`<text x="%d" y="55" class="micro">%s</text>`, x, date.Format("Jan")))
			lastMonth = date.Month()
		}
	}
	body := fmt.Sprintf(`<g>%s%s<text x="25" y="%d" class="muted">%s contributions in the last year</text><g transform="translate(588,%d)"><text x="0" y="10" class="micro">Less</text>%s<text x="96" y="10" class="micro">More</text></g></g>`, months.String(), cells.String(), 169+offset, html.EscapeString(formatIntWithCommas(total)), 159+offset, calendarLegend(opts))
	return SVG(740, max(145, 190+offset), opts, title, body, "")
}

func contributionLevel(count, maximum int) int {
	if count <= 0 || maximum <= 0 {
		return 0
	}
	level := int(math.Ceil(float64(count) / float64(maximum) * 4))
	return minInt(max(level, 1), 4)
}

func calendarLegend(opts Options) string {
	var out strings.Builder
	for i, opacity := range []float64{0.08, 0.3, 0.5, 0.72, 1} {
		out.WriteString(fmt.Sprintf(`<rect x="%d" width="10" height="10" rx="2" fill="%s" opacity="%.2f"/>`, 30+i*13, opts.IconColor, opacity))
	}
	return out.String()
}

func RenderRecentActivityCard(username string, items []service.ActivityItem, opts Options) string {
	title := opts.CustomTitle
	if title == "" {
		title = username + "'s Recent Activity"
	}
	offset := cardContentOffset(opts)
	var rows strings.Builder
	if len(items) == 0 {
		rows.WriteString(fmt.Sprintf(`<text x="25" y="%d" class="muted">No recent public activity</text>`, 75+offset))
	}
	for i, item := range items {
		y := 67 + offset + i*42
		label := activityLabel(item)
		rows.WriteString(fmt.Sprintf(`<g transform="translate(25,%d)"><circle cx="6" cy="4" r="6" fill="%s" opacity=".9"/><text x="23" y="8" class="label">%s</text><text x="150" y="8" class="activity-title">%s</text><text x="510" y="8" class="micro" text-anchor="end">%s</text><line x1="0" y1="24" x2="510" y2="24" stroke="%s" opacity=".1"/></g>`, y, activityColor(item.Type, opts), html.EscapeString(label), html.EscapeString(truncate(item.Title, 48)), html.EscapeString(shortDate(item.CreatedAt)), opts.TextColor))
	}
	return SVG(560, max(115, 75+len(items)*42+offset), opts, title, rows.String(), "")
}

func activityLabel(item service.ActivityItem) string {
	labels := map[string]string{"commit": "Commit", "pull-request": "Pull request", "issue": "Issue", "release": "Release"}
	label := labels[item.Type]
	if item.Action != "" && item.Type != "commit" {
		label += " · " + item.Action
	}
	return label
}

func activityColor(kind string, opts Options) string {
	switch kind {
	case "release":
		return opts.TitleColor
	case "issue":
		return opts.RingColor
	default:
		return opts.IconColor
	}
}

func RenderRepoLanguagesCard(data service.RepoLanguagesData, opts Options) string {
	title := opts.CustomTitle
	if title == "" {
		title = data.NameWithOwner + " Languages"
	}
	offset := cardContentOffset(opts)
	barWidth := 445.0
	x := 25.0
	var bar, legend strings.Builder
	for i, lang := range data.Languages {
		percent := percentOf(lang.Size, float64(data.TotalSize))
		width := barWidth * percent / 100
		bar.WriteString(fmt.Sprintf(`<rect x="%.2f" y="70" width="%.2f" height="12" fill="%s"/>`, x, width, lang.Color))
		x += width
		col, row := i%2, i/2
		legend.WriteString(fmt.Sprintf(`<g transform="translate(%d,%d)"><circle cx="5" cy="5" r="5" fill="%s"/><text x="17" y="9" class="lang-name">%s %.2f%%</text></g>`, 25+col*225, 105+offset+row*25, lang.Color, html.EscapeString(lang.Name), percent))
	}
	totalLabel := data.TotalLabel
	if totalLabel == "" {
		totalLabel = formatBytes(int64(data.TotalSize)) + " total"
	}
	body := fmt.Sprintf(`<g transform="translate(0,%d)"><defs><clipPath id="language-bar"><rect x="25" y="70" width="445" height="12" rx="6"/></clipPath></defs><g clip-path="url(#language-bar)">%s</g><text x="25" y="60" class="muted">%s</text></g>%s`, offset, bar.String(), html.EscapeString(totalLabel), legend.String())
	height := max(155, 130+((len(data.Languages)+1)/2)*25+offset)
	return SVG(495, height, opts, title, body, "")
}

func RenderOrganizationCard(data service.OrganizationData, opts Options) string {
	title := opts.CustomTitle
	if title == "" {
		title = data.Name + " Organization Stats"
	}
	offset := cardContentOffset(opts)
	description := truncate(defaultString(data.Description, "GitHub organization"), 70)
	contributorSummary := "No recent public contribution data"
	if data.TopContributor != "" {
		contributorSummary = fmt.Sprintf("Top contributor: @%s · %d recent events", data.TopContributor, data.TopContributorEvents)
	}
	body := fmt.Sprintf(`<g transform="translate(0,%d)"><text x="25" y="65" class="muted">@%s · %s</text>%s%s%s%s%s<text x="25" y="143" class="micro">%s</text><rect x="25" y="155" width="445" height="42" rx="8" fill="%s" opacity=".08"/><text x="38" y="174" class="micro">Top repository</text><text x="38" y="190" class="label">%s</text><text x="455" y="184" text-anchor="end" class="metric-small">★ %s</text></g>`, offset, html.EscapeString(data.Login), html.EscapeString(description), orgMetric(25, "Repositories", data.Repositories, opts), orgMetric(115, "Members", data.Members, opts), orgMetric(205, "Stars", data.TotalStars, opts), orgMetric(295, "Contributors", data.ActiveContributors, opts), orgMetric(385, "Recent activity", data.RecentContributions, opts), html.EscapeString(contributorSummary), opts.IconColor, html.EscapeString(data.TopRepository), html.EscapeString(formatNumber(data.TopRepoStars)))
	return SVG(495, max(190, 220+offset), opts, title, body, "")
}

func orgMetric(x int, label string, value int, opts Options) string {
	return fmt.Sprintf(`<g transform="translate(%d,86)"><rect width="82" height="42" rx="7" fill="%s" opacity=".07"/><text x="9" y="18" class="metric-small">%s</text><text x="9" y="34" class="micro">%s</text></g>`, x, opts.IconColor, html.EscapeString(formatNumber(value)), html.EscapeString(label))
}

func cardContentOffset(opts Options) int {
	if opts.HideTitle {
		return -30
	}
	return 0
}

func formatDateRange(start, end string) string {
	if start == "" || end == "" {
		return ""
	}
	return shortDate(start) + " – " + shortDate(end)
}

func shortDate(value string) string {
	if len(value) >= 10 {
		value = value[:10]
	}
	date, err := time.Parse("2006-01-02", value)
	if err != nil {
		return value
	}
	return date.Format("Jan 2, 2006")
}

func shortYear(value string) string {
	if len(value) >= 4 {
		return value[:4]
	}
	return value
}

func SVG(width int, height int, opts Options, title string, body string, overlay string) string {
	stroke := opts.BorderColor
	if opts.HideBorder {
		stroke = "transparent"
	}
	titleNode := ""
	if !opts.HideTitle {
		titleNode = fmt.Sprintf(`<text x="25" y="35" class="title">%s</text>`, html.EscapeString(truncate(title, 48)))
	}
	bg := opts.BgColor
	defs := ""
	if strings.Contains(bg, ",") {
		parts := strings.Split(bg, ",")
		angle := parts[0]
		stops := strings.Builder{}
		for i, color := range parts[1:] {
			offset := 0
			if len(parts) > 2 {
				offset = int(float64(i) * 100 / float64(len(parts)-2))
			}
			stops.WriteString(fmt.Sprintf(`<stop offset="%d%%" stop-color="%s"/>`, offset, normalizeColor(color, "#ffffff")))
		}
		defs = fmt.Sprintf(`<defs><linearGradient id="gradient" gradientTransform="rotate(%s)">%s</linearGradient></defs>`, html.EscapeString(angle), stops.String())
		bg = "url(#gradient)"
	}
	return fmt.Sprintf(`<svg width="%d" height="%d" viewBox="0 0 %d %d" fill="none" xmlns="http://www.w3.org/2000/svg">
<style>%s</style>
%s
<rect x="0.5" y="0.5" width="%d" height="%d" rx="%.1f" fill="%s" stroke="%s"/>
%s
%s
%s
</svg>`, width, height, width, height, renderStyle(opts), defs, width-1, height-1, opts.BorderRadius, bg, stroke, titleNode, body, overlay)
}
