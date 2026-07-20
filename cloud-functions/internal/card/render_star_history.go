package card

import (
	"fmt"
	"html"
	"math"
	"strings"
	"time"

	"dev-stats/cloud-functions/internal/service"
)

type chartPoint struct {
	date  time.Time
	count int
}

func RenderStarHistoryCard(data service.StarHistoryData, opts Options) string {
	width := opts.CardWidth
	if width < 480 {
		width = 700
	}
	width = min(width, 1200)
	height := 360
	plotLeft, plotRight := 70, width-28
	plotTop, plotBottom := 72, 286

	points := make([]chartPoint, 0, len(data.Points)+1)
	for _, point := range data.Points {
		date, err := time.Parse("2006-01-02", point.Date)
		if err == nil {
			points = append(points, chartPoint{date: date, count: max(0, point.Count)})
		}
	}
	if len(points) == 0 {
		now := time.Now().UTC()
		points = []chartPoint{{date: now.AddDate(0, 0, -1), count: 0}, {date: now, count: data.TotalStars}}
	}
	createdAt, createdErr := time.Parse(time.RFC3339, data.CreatedAt)
	if createdErr == nil && createdAt.Before(points[0].date) {
		points = append([]chartPoint{{date: createdAt.UTC(), count: 0}}, points...)
	} else if points[0].count > 0 {
		points = append([]chartPoint{{date: points[0].date.AddDate(0, 0, -1), count: 0}}, points...)
	}
	points = sampleChartPoints(points, 180)

	minDate, maxDate := points[0].date, points[len(points)-1].date
	if !maxDate.After(minDate) {
		maxDate = minDate.AddDate(0, 0, 1)
	}
	maxStars := max(1, data.TotalStars)
	for _, point := range points {
		maxStars = max(maxStars, point.count)
	}
	maxY := niceChartMaximum(maxStars)

	xFor := func(date time.Time) float64 {
		span := maxDate.Sub(minDate).Seconds()
		return float64(plotLeft) + date.Sub(minDate).Seconds()/span*float64(plotRight-plotLeft)
	}
	yFor := func(count int) float64 {
		return float64(plotBottom) - float64(count)/float64(maxY)*float64(plotBottom-plotTop)
	}

	var body strings.Builder
	body.WriteString(`<defs><linearGradient id="star-history-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="`)
	body.WriteString(opts.IconColor)
	body.WriteString(`" stop-opacity="0.26"/><stop offset="100%" stop-color="`)
	body.WriteString(opts.IconColor)
	body.WriteString(`" stop-opacity="0.02"/></linearGradient></defs>`)

	for i := 0; i <= 4; i++ {
		y := float64(plotBottom) - float64(i)/4*float64(plotBottom-plotTop)
		value := int(math.Round(float64(maxY) * float64(i) / 4))
		body.WriteString(fmt.Sprintf(`<line x1="%d" y1="%.1f" x2="%d" y2="%.1f" stroke="%s" stroke-opacity="0.16"/><text x="%d" y="%.1f" class="micro" text-anchor="end">%s</text>`, plotLeft, y, plotRight, y, opts.TextColor, plotLeft-9, y+3, html.EscapeString(formatNumber(value))))
	}
	for i := 0; i <= 4; i++ {
		date := minDate.Add(time.Duration(float64(maxDate.Sub(minDate)) * float64(i) / 4))
		x := xFor(date)
		anchor := "middle"
		if i == 0 {
			anchor = "start"
		} else if i == 4 {
			anchor = "end"
		}
		body.WriteString(fmt.Sprintf(`<text x="%.1f" y="%d" class="micro" text-anchor="%s">%s</text>`, x, plotBottom+22, anchor, html.EscapeString(date.Format("Jan 2006"))))
	}

	path := strings.Builder{}
	for i, point := range points {
		command := "L"
		if i == 0 {
			command = "M"
		}
		path.WriteString(fmt.Sprintf("%s%.1f %.1f", command, xFor(point.date), yFor(point.count)))
	}
	linePath := path.String()
	areaPath := fmt.Sprintf("M%.1f %dL%sL%.1f %dZ", xFor(points[0].date), plotBottom, strings.TrimPrefix(linePath, "M"), xFor(points[len(points)-1].date), plotBottom)
	body.WriteString(fmt.Sprintf(`<path d="%s" fill="url(#star-history-fill)"/><path d="%s" fill="none" stroke="%s" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`, areaPath, linePath, opts.IconColor))

	last := points[len(points)-1]
	body.WriteString(fmt.Sprintf(`<circle cx="%.1f" cy="%.1f" r="4" fill="%s" stroke="%s" stroke-width="2"/><text x="%d" y="%d" class="label">★ %s stars</text>`, xFor(last.date), yFor(last.count), opts.IconColor, opts.BgColor, plotLeft, height-27, html.EscapeString(formatIntWithCommas(data.TotalStars))))
	if data.Sampled {
		body.WriteString(fmt.Sprintf(`<text x="%d" y="%d" class="micro" text-anchor="end">sampled history · GitHub API</text>`, plotRight, height-27))
	}

	title := opts.CustomTitle
	if title == "" {
		title = data.FullName + " Star History"
	}
	return SVG(width, height, opts, title, body.String(), "")
}

func sampleChartPoints(points []chartPoint, limit int) []chartPoint {
	if len(points) <= limit || limit < 2 {
		return points
	}
	out := make([]chartPoint, 0, limit)
	for i := 0; i < limit; i++ {
		index := int(math.Round(float64(i) * float64(len(points)-1) / float64(limit-1)))
		out = append(out, points[index])
	}
	return out
}

func niceChartMaximum(value int) int {
	if value <= 4 {
		return 4
	}
	power := math.Pow10(int(math.Floor(math.Log10(float64(value)))))
	normalized := float64(value) / power
	nice := 10.0
	switch {
	case normalized <= 2:
		nice = 2
	case normalized <= 5:
		nice = 5
	}
	return int(nice * power)
}
