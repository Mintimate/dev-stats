package card

import (
	"crypto/sha1"
	"fmt"
	"html"
	"math"
	"regexp"
	"strconv"
	"strings"

	"dev-stats/cloud-functions/internal/service"
)

func parseBool(raw string) bool {
	switch strings.ToLower(raw) {
	case "1", "true", "yes", "on":
		return true
	default:
		return false
	}
}

func parseCSV(raw string) []string {
	if raw == "" {
		return nil
	}
	parts := strings.Split(raw, ",")
	out := make([]string, 0, len(parts))
	for _, part := range parts {
		part = strings.TrimSpace(part)
		if part != "" {
			out = append(out, part)
		}
	}
	return out
}

func parseIntDefault(raw string, fallback int) int {
	value, err := strconv.Atoi(raw)
	if err != nil {
		return fallback
	}
	return value
}

func parseFloatDefault(raw string, fallback float64) float64 {
	value, err := strconv.ParseFloat(raw, 64)
	if err != nil {
		return fallback
	}
	return value
}

func normalizeColor(raw string, fallback string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return fallback
	}
	if strings.Contains(raw, ",") {
		raw = strings.Split(raw, ",")[0]
	}
	raw = strings.TrimPrefix(raw, "#")
	if matched, _ := regexp.MatchString(`^[0-9a-fA-F]{3}([0-9a-fA-F]{3})?([0-9a-fA-F]{2})?$`, raw); matched {
		return "#" + raw
	}
	return fallback
}

func normalizeBgColor(raw string, fallback string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return fallback
	}
	if strings.Contains(raw, ",") {
		parts := strings.Split(raw, ",")
		if len(parts) < 2 {
			return fallback
		}
		for i := 1; i < len(parts); i++ {
			parts[i] = normalizeColor(parts[i], "")
			if parts[i] == "" {
				return fallback
			}
		}
		return strings.Join(parts, ",")
	}
	return normalizeColor(raw, fallback)
}

func defaultColor(value string, fallback string) string {
	if value == "" {
		return fallback
	}
	return value
}

func defaultString(value string, fallback string) string {
	if strings.TrimSpace(value) == "" {
		return fallback
	}
	return strings.TrimSpace(value)
}

func colorForName(name string) string {
	palette := []string{"#3572A5", "#f1e05a", "#2b7489", "#00ADD8", "#dea584", "#89e051", "#701516", "#4F5D95"}
	sum := sha1.Sum([]byte(name))
	return palette[int(sum[0])%len(palette)]
}

func setFromStrings(values []string) map[string]bool {
	set := make(map[string]bool, len(values))
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value != "" {
			set[value] = true
			set[strings.ToLower(value)] = true
		}
	}
	return set
}

func formatNumber(value int) string {
	switch {
	case value >= 1_000_000:
		return fmt.Sprintf("%.1fM", float64(value)/1_000_000)
	case value >= 1_000:
		return fmt.Sprintf("%.1fk", float64(value)/1_000)
	default:
		return strconv.Itoa(value)
	}
}

func formatNumberWithOptions(value int, opts Options) string {
	if opts.NumberFormat == "long" {
		return formatIntWithCommas(value)
	}
	if opts.NumberPrecision >= 0 && value >= 1000 && value < 1_000_000 {
		divisor := 1000.0
		unit := "k"
		if value >= 1_000_000 {
			divisor = 1_000_000
			unit = "M"
		}
		format := "%." + strconv.Itoa(max(0, opts.NumberPrecision)) + "f%s"
		return fmt.Sprintf(format, float64(value)/divisor, unit)
	}
	return formatNumber(value)
}

func formatIntWithCommas(value int) string {
	sign := ""
	if value < 0 {
		sign = "-"
		value = -value
	}
	raw := strconv.Itoa(value)
	if len(raw) <= 3 {
		return sign + raw
	}
	var out []byte
	prefix := len(raw) % 3
	if prefix == 0 {
		prefix = 3
	}
	out = append(out, raw[:prefix]...)
	for i := prefix; i < len(raw); i += 3 {
		out = append(out, ',')
		out = append(out, raw[i:i+3]...)
	}
	return sign + string(out)
}

func formatBytes(value int64) string {
	units := []string{"B", "KB", "MB", "GB", "TB"}
	size := float64(value)
	unit := 0
	for size >= 1024 && unit < len(units)-1 {
		size /= 1024
		unit++
	}
	if unit == 0 {
		return fmt.Sprintf("%d %s", value, units[unit])
	}
	return fmt.Sprintf("%.1f %s", size, units[unit])
}

func wrapText(text string, maxChars int, maxLines int) []string {
	text = strings.TrimSpace(strings.Join(strings.Fields(text), " "))
	if text == "" || maxChars <= 0 || maxLines <= 0 {
		return nil
	}
	words := strings.Fields(text)
	lines := make([]string, 0, maxLines)
	current := ""
	for _, word := range words {
		if runeLen(word) > maxChars {
			word = truncate(word, maxChars)
		}
		next := word
		if current != "" {
			next = current + " " + word
		}
		if runeLen(next) <= maxChars {
			current = next
			continue
		}
		lines = append(lines, current)
		current = word
		if len(lines) == maxLines {
			break
		}
	}
	if current != "" && len(lines) < maxLines {
		lines = append(lines, current)
	}
	if len(lines) == maxLines && strings.Join(lines, " ") != text {
		lines[len(lines)-1] = truncate(lines[len(lines)-1], max(4, maxChars-1))
	}
	return lines
}

func renderTextLines(lines []string, x int, y int, lineHeight int, className string) string {
	var out strings.Builder
	for i, line := range lines {
		out.WriteString(fmt.Sprintf(`<text x="%d" y="%d" class="%s">%s</text>`, x, y+i*lineHeight, html.EscapeString(className), html.EscapeString(line)))
	}
	return out.String()
}

func filterLangs(langs []service.LanguageStat, count int, hide []string) ([]service.LanguageStat, float64) {
	hidden := setFromStrings(hide)
	filtered := make([]service.LanguageStat, 0, count)
	total := 0.0
	for _, lang := range langs {
		if hidden[lang.Name] || hidden[strings.ToLower(lang.Name)] {
			continue
		}
		filtered = append(filtered, lang)
		total += lang.Size
		if len(filtered) == count {
			break
		}
	}
	return filtered, total
}

func percentOf(value float64, total float64) float64 {
	if total <= 0 {
		return 0
	}
	return value / total * 100
}

func langDisplayValue(size float64, percent float64, statsFormat string) string {
	switch strings.ToLower(statsFormat) {
	case "bytes":
		return formatBytes(int64(size))
	case "count":
		return strconv.Itoa(int(math.Round(size)))
	default:
		return fmt.Sprintf("%.2f%%", percent)
	}
}

func renderRank(opts Options, level string, percentile float64, x int, y int) string {
	if level == "" {
		level = "C"
	}
	circumference := 2 * math.Pi * 38
	progress := math.Max(0.08, math.Min(1, (100-percentile)/100))
	dash := progress * circumference
	center := fmt.Sprintf(`<text x="40" y="52" text-anchor="middle" class="rank">%s</text>`, html.EscapeString(level))
	switch strings.ToLower(opts.RankIcon) {
	case "github":
		center = fmt.Sprintf(`<svg class="rank-github" x="13" y="13" viewBox="0 0 16 16" width="54" height="54"><path fill="%s" d="%s"/></svg>`, opts.IconColor, githubLogoPath)
	case "percentile":
		center = fmt.Sprintf(`<text x="40" y="47" text-anchor="middle" class="rank-percentile">%.1f%%</text>`, math.Max(0, 100-percentile))
	}
	return fmt.Sprintf(`<g transform="translate(%d,%d)"><circle class="rank-circle-rim" cx="40" cy="40" r="38"/><circle class="rank-circle" cx="40" cy="40" r="38" stroke-dasharray="%.1f %.1f" transform="rotate(-90 40 40)"/>%s</g>`, x, y, dash, circumference, center)
}

func pieSlice(cx float64, cy float64, r float64, start float64, end float64, color string) string {
	if end <= start {
		return ""
	}
	startX, startY := polarPoint(cx, cy, r, start)
	endX, endY := polarPoint(cx, cy, r, end)
	largeArc := 0
	if end-start > 180 {
		largeArc = 1
	}
	return fmt.Sprintf(`<path d="M %.2f %.2f L %.2f %.2f A %.2f %.2f 0 %d 1 %.2f %.2f Z" fill="%s"/>`, cx, cy, startX, startY, r, r, largeArc, endX, endY, color)
}

func donutArc(cx float64, cy float64, r float64, start float64, end float64, color string) string {
	if end <= start {
		return ""
	}
	startX, startY := polarPoint(cx, cy, r, start)
	endX, endY := polarPoint(cx, cy, r, end)
	largeArc := 0
	if end-start > 180 {
		largeArc = 1
	}
	return fmt.Sprintf(`<path d="M %.2f %.2f A %.2f %.2f 0 %d 1 %.2f %.2f" fill="none" stroke="%s" stroke-width="24" stroke-linecap="butt"/>`, startX, startY, r, r, largeArc, endX, endY, color)
}

func polarPoint(cx float64, cy float64, r float64, angle float64) (float64, float64) {
	radians := angle * math.Pi / 180
	return cx + r*math.Cos(radians), cy + r*math.Sin(radians)
}

func runeLen(value string) int {
	return len([]rune(value))
}

func truncate(value string, maxLen int) string {
	value = strings.TrimSpace(value)
	if len([]rune(value)) <= maxLen {
		return value
	}
	runes := []rune(value)
	return string(runes[:maxLen-1]) + "..."
}

func max(a int, b int) int {
	if a > b {
		return a
	}
	return b
}

func minInt(a int, b int) int {
	if a < b {
		return a
	}
	return b
}

const (
	svgIconStar     = `<path d="M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.75.75 0 0 1-1.088.791L8 12.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L.818 6.374a.75.75 0 0 1 .416-1.28l4.21-.611L7.327.668A.75.75 0 0 1 8 .25Z"/>`
	svgIconCommits  = `<path d="M5.75 7.25a2.25 2.25 0 1 0 0 1.5h4.5a2.25 2.25 0 1 0 0-1.5h-4.5ZM4 8a.75.75 0 1 1-1.5 0A.75.75 0 0 1 4 8Zm9.5 0a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Z"/><path d="M1.75 3.5A1.75 1.75 0 0 1 3.5 1.75h9A1.75 1.75 0 0 1 14.25 3.5v9a1.75 1.75 0 0 1-1.75 1.75h-9a1.75 1.75 0 0 1-1.75-1.75v-9ZM3.5 3.25a.25.25 0 0 0-.25.25v9c0 .138.112.25.25.25h9a.25.25 0 0 0 .25-.25v-9a.25.25 0 0 0-.25-.25h-9Z"/>`
	svgIconPRs      = `<path d="M1.5 3.25a2.25 2.25 0 1 1 3 2.122v5.256a2.251 2.251 0 1 1-1.5 0V5.372A2.25 2.25 0 0 1 1.5 3.25Zm2.25-.75a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm0 9.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm7-9.5a.75.75 0 0 0-.75.75v2.19l.72-.72a.75.75 0 1 1 1.06 1.06l-2 2a.75.75 0 0 1-1.06 0l-2-2a.75.75 0 1 1 1.06-1.06l.72.72V3.25a2.25 2.25 0 1 1 2.25 2.25.75.75 0 0 1 0-1.5.75.75 0 0 0 0-1.5Z"/>`
	svgIconIssues   = `<path d="M8 1.75a6.25 6.25 0 1 0 0 12.5 6.25 6.25 0 0 0 0-12.5ZM.25 8a7.75 7.75 0 1 1 15.5 0A7.75 7.75 0 0 1 .25 8ZM8 4.75a.75.75 0 0 1 .75.75v3a.75.75 0 0 1-1.5 0v-3A.75.75 0 0 1 8 4.75Zm0 7a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z"/>`
	svgIconContribs = `<path d="M5 3.25a.75.75 0 0 1 .75-.75h7.5a.75.75 0 0 1 .75.75v7.5a.75.75 0 0 1-1.5 0V5.06L4.03 13.53a.75.75 0 0 1-1.06-1.06L11.44 4H5.75A.75.75 0 0 1 5 3.25Z"/>`
	svgIconFork     = `<path d="M5 3.25a2.25 2.25 0 1 0-1.5 2.122v5.256a2.25 2.25 0 1 0 1.5 0V8.75h3.25A2.75 2.75 0 0 0 11 6V5.372a2.25 2.25 0 1 0-1.5 0V6c0 .69-.56 1.25-1.25 1.25H5V5.372A2.25 2.25 0 0 0 5 3.25ZM3.75 2.5a.75.75 0 1 1 0 1.5.75.75 0 0 1 0-1.5Zm0 9.5a.75.75 0 1 1 0 1.5.75.75 0 0 1 0-1.5Zm6.5-9.5a.75.75 0 1 1 0 1.5.75.75 0 0 1 0-1.5Z"/>`
	githubLogoPath  = `M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82A7.65 7.65 0 0 1 8 3.86c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z`
)
