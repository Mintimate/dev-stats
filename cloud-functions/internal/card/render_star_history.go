package card

import (
	"fmt"
	"math"
	"strings"
	"time"

	"dev-stats/cloud-functions/internal/service"
)

func RenderStarHistoryCard(data service.StarHistoryData, opts Options) string {
	width := opts.CardWidth
	if width <= 0 {
		width = 700
	}
	width = minInt(max(width, 480), 1200)
	offset := cardContentOffset(opts)
	title := defaultString(opts.CustomTitle, data.FullName+" Star History")

	if len(data.Points) == 0 {
		message := "No star history available"
		if data.TotalStars == 0 {
			message = "No stars yet"
		}
		body := fmt.Sprintf(`<text x="25" y="%d" class="muted">%s</text>`, 73+offset, message)
		return SVG(width, 101+offset, opts, title, body, "")
	}

	const plotLeft = 64
	plotRight := width - 26
	plotTop, plotBottom := 62+offset, 272+offset
	height := 346 + offset
	points := data.Points
	first, last := points[0], points[len(points)-1]
	span := last.Date.Sub(first.Date)
	maxCount := max(1, data.TotalStars)
	for _, point := range points {
		maxCount = max(maxCount, point.Count)
	}
	step := starHistoryTickStep(maxCount)
	ticks := int(math.Ceil(float64(maxCount) / step))
	maxY := float64(ticks) * step
	xFor := func(date time.Time) float64 {
		if span <= 0 {
			return float64(plotLeft+plotRight) / 2
		}
		return float64(plotLeft) + float64(date.Sub(first.Date))/float64(span)*float64(plotRight-plotLeft)
	}
	yFor := func(value float64) float64 {
		return float64(plotBottom) - value/maxY*float64(plotBottom-plotTop)
	}

	var body strings.Builder
	fmt.Fprintf(&body, `<defs><linearGradient id="star-history-fill" x2="0%%" y2="100%%"><stop offset="0%%" stop-color="%s" stop-opacity=".24"/><stop offset="100%%" stop-color="%s" stop-opacity=".02"/></linearGradient></defs>`, opts.IconColor, opts.IconColor)
	for tick := 0; tick <= ticks; tick++ {
		value := float64(tick) * step
		y := yFor(value)
		fmt.Fprintf(&body, `<line x1="%d" y1="%.1f" x2="%d" y2="%.1f" stroke="%s" stroke-opacity=".16"/><text x="%d" y="%.1f" class="micro" text-anchor="end">%s</text>`, plotLeft, y, plotRight, y, opts.TextColor, plotLeft-9, y+3, formatNumber(int(value)))
	}

	dateFormat := "Jan 2006"
	if span < 365*24*time.Hour {
		dateFormat = "Jan 2, 2006"
	}
	dateTicks := minInt(4, max(0, int(span/(24*time.Hour))))
	if dateTicks == 0 {
		fmt.Fprintf(&body, `<text x="%.1f" y="%d" class="micro" text-anchor="middle">%s</text>`, float64(plotLeft+plotRight)/2, plotBottom+21, first.Date.Format(dateFormat))
	} else {
		for tick := 0; tick <= dateTicks; tick++ {
			date := first.Date.Add(time.Duration(float64(span) * float64(tick) / float64(dateTicks)))
			anchor := "middle"
			switch tick {
			case 0:
				anchor = "start"
			case dateTicks:
				anchor = "end"
			}
			fmt.Fprintf(&body, `<text x="%.1f" y="%d" class="micro" text-anchor="%s">%s</text>`, xFor(date), plotBottom+21, anchor, date.Format(dateFormat))
		}
	}

	lastX := xFor(last.Date)
	if len(points) > 1 {
		var line strings.Builder
		firstX := xFor(first.Date)
		fmt.Fprintf(&line, "%.1f %.1f", firstX, yFor(float64(first.Count)))
		// Sample the drawing at no more than one point per horizontal pixel.
		// The first and last points are always included.
		lastPixel := int(firstX)
		for _, point := range points[1 : len(points)-1] {
			x := xFor(point.Date)
			if int(x) == lastPixel || int(x) == int(lastX) {
				continue
			}
			fmt.Fprintf(&line, "L%.1f %.1f", x, yFor(float64(point.Count)))
			lastPixel = int(x)
		}
		fmt.Fprintf(&line, "L%.1f %.1f", lastX, yFor(float64(last.Count)))
		coords := line.String()
		fmt.Fprintf(&body, `<path d="M%.1f %dL%sL%.1f %dZ" fill="url(#star-history-fill)"/><path d="M%s" fill="none" stroke="%s" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`, firstX, plotBottom, coords, lastX, plotBottom, coords, opts.IconColor)
	}
	fmt.Fprintf(&body, `<circle cx="%.1f" cy="%.1f" r="3.5" fill="%s"><title>%s · %s</title></circle>`, lastX, yFor(float64(last.Count)), opts.IconColor, last.Date.Format("Jan 2, 2006"), starHistoryCount(last.Count))
	footerX := plotLeft
	if opts.ShowIcons {
		fmt.Fprintf(&body, `<svg x="%d" y="%d" viewBox="0 0 16 16" width="15" height="15" class="icon">%s</svg>`, footerX, height-37, svgIconStar)
		footerX += 21
	}
	weight := "regular"
	if opts.TextBold {
		weight = "bold"
	}
	fmt.Fprintf(&body, `<text x="%d" y="%d" class="stat %s">%s</text>`, footerX, height-25, weight, starHistoryCount(data.TotalStars))
	return SVG(width, height, opts, title, body.String(), "")
}

func starHistoryTickStep(maxCount int) float64 {
	minimum := math.Max(1, float64(maxCount)/4)
	magnitude := math.Pow10(int(math.Floor(math.Log10(minimum))))
	for _, unit := range []float64{1, 2, 5} {
		if step := unit * magnitude; step >= minimum {
			return step
		}
	}
	return 10 * magnitude
}

func starHistoryCount(count int) string {
	if count == 1 {
		return "1 star"
	}
	return formatIntWithCommas(count) + " stars"
}
