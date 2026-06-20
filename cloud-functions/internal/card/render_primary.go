package card

import (
	"fmt"
	"github-readme-stats-eo/cloud-functions/internal/service"
	"html"
	"strings"
)

func RenderStatsCard(data service.StatsData, opts Options) string {
	title := opts.CustomTitle
	if title == "" {
		title = data.Name + "'s GitHub Stats"
	}
	width := opts.CardWidth
	if width < 287 {
		if opts.HideRank {
			width = 287
		} else {
			width = 450
		}
	}
	lineHeight := opts.LineHeight
	if lineHeight < 18 {
		lineHeight = 25
	}
	stats := []struct {
		key   string
		label string
		value string
		icon  string
	}{
		{"stars", "Total Stars Earned", formatNumberWithOptions(data.TotalStars, opts), svgIconStar},
		{"commits", "Total Commits", formatNumberWithOptions(data.TotalCommits, opts), svgIconCommits},
		{"prs", "Total PRs", formatNumberWithOptions(data.TotalPRs, opts), svgIconPRs},
		{"issues", "Total Issues", formatNumberWithOptions(data.TotalIssues, opts), svgIconIssues},
		{"contribs", "Contributed to (last year)", formatNumberWithOptions(data.ContributedTo, opts), svgIconContribs},
	}
	showSet := setFromStrings(opts.ShowStats)
	if showSet["prs_merged"] {
		stats = append(stats, struct {
			key   string
			label string
			value string
			icon  string
		}{"prs_merged", "Merged PRs", formatNumberWithOptions(data.TotalPRsMerged, opts), svgIconPRs})
	}
	if showSet["prs_merged_percentage"] {
		stats = append(stats, struct {
			key   string
			label string
			value string
			icon  string
		}{"prs_merged_percentage", "Merged PRs Percentage", fmt.Sprintf("%.1f%%", data.MergedPRsPercentage), svgIconPRs})
	}
	if showSet["reviews"] {
		stats = append(stats, struct {
			key   string
			label string
			value string
			icon  string
		}{"reviews", "Reviews", formatNumberWithOptions(data.TotalReviews, opts), svgIconPRs})
	}
	if showSet["discussions_started"] {
		stats = append(stats, struct {
			key   string
			label string
			value string
			icon  string
		}{"discussions_started", "Discussions Started", formatNumberWithOptions(data.TotalDiscussionsStarted, opts), svgIconIssues})
	}
	if showSet["discussions_answered"] {
		stats = append(stats, struct {
			key   string
			label string
			value string
			icon  string
		}{"discussions_answered", "Discussions Answered", formatNumberWithOptions(data.TotalDiscussionsAnswered, opts), svgIconIssues})
	}
	hideSet := setFromStrings(opts.HideStats)
	rows := make([]string, 0, len(stats))
	for _, stat := range stats {
		if hideSet[stat.key] || hideSet[strings.ToLower(stat.label)] {
			continue
		}
		rows = append(rows, statRow(stat.label, stat.value, stat.icon, 58+len(rows)*lineHeight, opts))
	}
	rank := ""
	if !opts.HideRank {
		rankX := width - 105
		rank = renderRank(opts, data.RankLevel, data.RankPercentile, rankX, 75)
	}
	height := max(150, 45+(len(rows)+1)*lineHeight)
	return SVG(width, height, opts, title, strings.Join(rows, ""), rank)
}

func statRow(label string, value string, icon string, y int, opts Options) string {
	iconPart := ""
	labelX := 25
	valueX := 230
	if opts.ShowIcons {
		iconPart = fmt.Sprintf(`<svg class="icon" x="0" y="-13" viewBox="0 0 16 16" width="16" height="16">%s</svg>`, icon)
		labelX = 27
		valueX = 250
	}
	weightClass := "bold"
	if !opts.TextBold {
		weightClass = "regular"
	}
	return fmt.Sprintf(`<g class="stagger" transform="translate(25,%d)">%s<text class="stat %s" x="%d" y="0">%s:</text><text class="stat %s" x="%d" y="0">%s</text></g>`, y, iconPart, weightClass, labelX, html.EscapeString(label), weightClass, valueX, html.EscapeString(value))
}

func RenderRepoCard(data service.RepoData, opts Options, showOwner bool) string {
	title := data.Name
	if showOwner && data.NameWithOwner != "" {
		title = data.NameWithOwner
	}
	if !opts.ThemeProvided {
		opts = applyTheme(opts, "default_repocard")
	}
	descLines := wrapText(data.Description, 58, 3)
	if len(descLines) == 0 {
		descLines = []string{"No description provided"}
	}
	desc := renderTextLines(descLines, 25, 68, 18, "desc")
	langNode := ""
	if data.PrimaryLang != "" {
		langNode = fmt.Sprintf(`<circle cx="30" cy="142" r="6" fill="%s"/><text x="45" y="146" class="muted">%s</text>`, data.LanguageColor, html.EscapeString(data.PrimaryLang))
	}
	stats := fmt.Sprintf(`<g transform="translate(215,146)"><svg class="icon" x="0" y="-13" viewBox="0 0 16 16" width="16" height="16">%s</svg><text x="22" class="muted">%s</text></g><g transform="translate(305,146)"><svg class="icon" x="0" y="-13" viewBox="0 0 16 16" width="16" height="16">%s</svg><text x="22" class="muted">%s</text></g>`, svgIconStar, formatNumber(data.Stars), svgIconFork, formatNumber(data.Forks))
	body := desc + langNode + stats
	return SVG(400, 170, opts, title, body, "")
}

func RenderGistCard(data service.GistData, opts Options, showOwner bool) string {
	title := data.Name
	if showOwner && data.NameWithOwner != "" {
		title = data.NameWithOwner
	}
	descLines := wrapText(data.Description, 58, 3)
	if len(descLines) == 0 {
		descLines = []string{"No description provided"}
	}
	desc := renderTextLines(descLines, 25, 68, 18, "desc")
	langNode := ""
	if data.Language != "" {
		langNode = fmt.Sprintf(`<circle cx="30" cy="142" r="6" fill="%s"/><text x="45" y="146" class="muted">%s</text>`, colorForName(data.Language), html.EscapeString(data.Language))
	}
	stats := fmt.Sprintf(`<text x="215" y="146" class="muted">Stars %s</text><text x="305" y="146" class="muted">Forks %s</text>`, formatNumber(data.Stars), formatNumber(data.Forks))
	return SVG(400, 170, opts, title, desc+langNode+stats, "")
}

func applyTheme(opts Options, name string) Options {
	theme, ok := builtinThemes[name]
	if !ok {
		return opts
	}
	border := theme.Border
	if border == "" {
		border = builtinThemes["default"].Border
	}
	ring := theme.Ring
	if ring == "" {
		ring = theme.Title
	}
	opts.Theme = name
	opts.TitleColor = normalizeColor(theme.Title, opts.TitleColor)
	opts.TextColor = normalizeColor(theme.Text, opts.TextColor)
	opts.IconColor = normalizeColor(theme.Icon, opts.IconColor)
	opts.BgColor = normalizeBgColor(theme.Bg, opts.BgColor)
	opts.BorderColor = normalizeColor(border, opts.BorderColor)
	opts.RingColor = normalizeColor(ring, opts.RingColor)
	return opts
}

func RenderTopLangsCard(langs []service.LanguageStat, opts Options, count int, hide []string) string {
	if count <= 0 || count > 20 {
		if opts.Layout == "compact" || opts.Layout == "pie" || opts.Layout == "donut-vertical" || opts.HideProgress {
			count = 6
		} else {
			count = 5
		}
	}
	filtered, total := filterLangs(langs, count, hide)
	title := opts.CustomTitle
	if title == "" {
		title = "Most Used Languages"
	}
	if len(filtered) == 0 {
		width := opts.CardWidth
		if width < 280 {
			width = 300
		}
		height := 90
		y := 66
		if opts.HideTitle {
			height = 60
			y = 36
		}
		return SVG(width, height, opts, title, fmt.Sprintf(`<text x="25" y="%d" class="stat bold">No languages data</text>`, y), "")
	}
	switch opts.Layout {
	case "compact":
		return renderCompactLangs(filtered, total, opts, title)
	case "donut", "donut-vertical", "pie":
		return renderDonutLangs(filtered, total, opts, title)
	default:
		if opts.HideProgress {
			return renderCompactLangs(filtered, total, opts, title)
		}
		return renderNormalLangs(filtered, total, opts, title)
	}
}

func renderNormalLangs(filtered []service.LanguageStat, total float64, opts Options, title string) string {
	width := opts.CardWidth
	if width < 280 {
		width = 300
	}
	contentWidth := float64(width - 95)
	contentOffset := 0
	if opts.HideTitle {
		contentOffset = -30
	}
	rows := strings.Builder{}
	for i, lang := range filtered {
		percent := percentOf(lang.Size, total)
		y := 55 + contentOffset + i*40
		display := langDisplayValue(lang.Size, percent, opts.StatsFormat)
		progress := ""
		if !opts.HideProgress {
			progress = fmt.Sprintf(`<text x="%.1f" y="34" class="lang-name">%s</text><rect x="0" y="25" width="%.1f" height="8" rx="5" fill="#ddd" opacity=".35"/><rect x="0" y="25" width="%.1f" height="8" rx="5" fill="%s"/>`, contentWidth+10, html.EscapeString(display), contentWidth, contentWidth*percent/100, lang.Color)
		}
		rows.WriteString(fmt.Sprintf(`<g transform="translate(25,%d)"><text class="lang-name" x="0" y="15">%s</text>%s</g>`, y, html.EscapeString(lang.Name), progress))
	}
	height := 45 + (len(filtered)+1)*40
	if opts.HideTitle {
		height -= 30
	}
	return SVG(width, max(90, height), opts, title, rows.String(), "")
}

func renderCompactLangs(filtered []service.LanguageStat, total float64, opts Options, title string) string {
	width := opts.CardWidth
	if width < 280 {
		width = 300
	}
	contentOffset := 0
	if opts.HideTitle {
		contentOffset = -30
	}
	rows := strings.Builder{}
	for i, lang := range filtered {
		percent := percentOf(lang.Size, total)
		col := i % 2
		row := i / 2
		x := 25 + col*((width-50)/2)
		y := 65 + contentOffset + row*25
		label := lang.Name
		if !opts.HideProgress {
			label = fmt.Sprintf("%s %.2f%%", label, percent)
		}
		rows.WriteString(fmt.Sprintf(`<g transform="translate(%d,%d)"><circle cx="5" cy="6" r="5" fill="%s"/><text x="17" y="10" class="lang-name">%s</text></g>`, x, y, lang.Color, html.EscapeString(label)))
	}
	height := max(90, 90+((len(filtered)+1)/2)*25)
	if opts.HideTitle {
		height -= 30
	}
	return SVG(width, height, opts, title, rows.String(), "")
}

func renderDonutLangs(filtered []service.LanguageStat, total float64, opts Options, title string) string {
	legend := strings.Builder{}
	contentOffset := 0
	if opts.HideTitle {
		contentOffset = -30
	}
	width := 467
	cx, cy, r := 340.0, 125.0+float64(contentOffset), 62.0
	isVertical := opts.Layout == "donut-vertical" || opts.Layout == "pie"
	if isVertical {
		width = 300
		cx, cy = 150.0, 155.0+float64(contentOffset)
		r = 80
		if opts.Layout == "pie" {
			r = 90
		}
	}
	chart := strings.Builder{}
	start := -90.0
	for i, lang := range filtered {
		percent := percentOf(lang.Size, total)
		if isVertical {
			col := i % 2
			row := i / 2
			x := 25 + col*135
			y := 275 + contentOffset + row*25
			legend.WriteString(fmt.Sprintf(`<g transform="translate(%d,%d)"><circle cx="5" cy="6" r="5" fill="%s"/><text x="17" y="10" class="lang-name">%s %.2f%%</text></g>`, x, y, lang.Color, html.EscapeString(lang.Name), percent))
		} else {
			y := 55 + contentOffset + i*32
			legend.WriteString(fmt.Sprintf(`<g transform="translate(25,%d)"><circle cx="5" cy="6" r="5" fill="%s"/><text x="22" y="11" class="lang-name">%s %.2f%%</text></g>`, y, lang.Color, html.EscapeString(lang.Name), percent))
		}
		if opts.Layout == "pie" {
			if len(filtered) == 1 {
				chart.WriteString(fmt.Sprintf(`<circle cx="%.1f" cy="%.1f" r="%.1f" fill="%s"/>`, cx, cy, r, lang.Color))
			} else {
				chart.WriteString(pieSlice(cx, cy, r, start, start+percent*3.6, lang.Color))
			}
		} else {
			chart.WriteString(donutArc(cx, cy, r, start, start+percent*3.6, lang.Color))
		}
		start += percent * 3.6
	}
	if opts.Layout != "pie" {
		innerBg := opts.BgColor
		if strings.Contains(innerBg, ",") {
			innerBg = "url(#gradient)"
		}
		chart.WriteString(fmt.Sprintf(`<circle cx="%.1f" cy="%.1f" r="38" fill="%s"/>`, cx, cy, innerBg))
	}
	height := 215 + max(len(filtered)-5, 0)*32
	if isVertical {
		height = 300 + ((len(filtered)+1)/2)*25
	}
	if opts.HideTitle {
		height -= 30
	}
	return SVG(width, height, opts, title, legend.String()+chart.String(), "")
}
