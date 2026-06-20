package card

import "fmt"

type Options struct {
	TitleColor      string
	TextColor       string
	IconColor       string
	BgColor         string
	BorderColor     string
	RingColor       string
	HideBorder      bool
	HideTitle       bool
	ShowIcons       bool
	TextBold        bool
	HideProgress    bool
	HideRank        bool
	DisableAnim     bool
	CustomTitle     string
	Theme           string
	ThemeProvided   bool
	RankIcon        string
	Layout          string
	StatsFormat     string
	DisplayFormat   string
	NumberFormat    string
	NumberPrecision int
	CardWidth       int
	LineHeight      int
	BorderRadius    float64
	HideStats       []string
	ShowStats       []string
}

type themeColors struct {
	Title  string
	Icon   string
	Text   string
	Bg     string
	Border string
	Ring   string
}

var builtinThemes = map[string]themeColors{
	"default":              {Title: "2f80ed", Icon: "4c71f2", Text: "434d58", Bg: "fffefe", Border: "e4e2e2"},
	"default_repocard":     {Title: "2f80ed", Icon: "586069", Text: "434d58", Bg: "fffefe", Border: ""},
	"transparent":          {Title: "006AFF", Icon: "0579C3", Text: "417E87", Bg: "ffffff00", Border: ""},
	"shadow_red":           {Title: "9A0000", Icon: "4F0000", Text: "444", Bg: "ffffff00", Border: "4F0000"},
	"shadow_green":         {Title: "007A00", Icon: "003D00", Text: "444", Bg: "ffffff00", Border: "003D00"},
	"shadow_blue":          {Title: "00779A", Icon: "004450", Text: "444", Bg: "ffffff00", Border: "004490"},
	"dark":                 {Title: "fff", Icon: "79ff97", Text: "9f9f9f", Bg: "151515", Border: ""},
	"radical":              {Title: "fe428e", Icon: "f8d847", Text: "a9fef7", Bg: "141321", Border: ""},
	"merko":                {Title: "abd200", Icon: "b7d364", Text: "68b587", Bg: "0a0f0b", Border: ""},
	"gruvbox":              {Title: "fabd2f", Icon: "fe8019", Text: "8ec07c", Bg: "282828", Border: ""},
	"gruvbox_light":        {Title: "b57614", Icon: "af3a03", Text: "427b58", Bg: "fbf1c7", Border: ""},
	"tokyonight":           {Title: "70a5fd", Icon: "bf91f3", Text: "38bdae", Bg: "1a1b27", Border: ""},
	"onedark":              {Title: "e4bf7a", Icon: "8eb573", Text: "df6d74", Bg: "282c34", Border: ""},
	"cobalt":               {Title: "e683d9", Icon: "0480ef", Text: "75eeb2", Bg: "193549", Border: ""},
	"synthwave":            {Title: "e2e9ec", Icon: "ef8539", Text: "e5289e", Bg: "2b213a", Border: ""},
	"highcontrast":         {Title: "e7f216", Icon: "00ffff", Text: "fff", Bg: "000", Border: ""},
	"dracula":              {Title: "ff6e96", Icon: "79dafa", Text: "f8f8f2", Bg: "282a36", Border: ""},
	"prussian":             {Title: "bddfff", Icon: "38a0ff", Text: "6e93b5", Bg: "172f45", Border: ""},
	"monokai":              {Title: "eb1f6a", Icon: "e28905", Text: "f1f1eb", Bg: "272822", Border: ""},
	"vue":                  {Title: "41b883", Icon: "41b883", Text: "273849", Bg: "fffefe", Border: ""},
	"vue-dark":             {Title: "41b883", Icon: "41b883", Text: "fffefe", Bg: "273849", Border: ""},
	"shades-of-purple":     {Title: "fad000", Icon: "b362ff", Text: "a599e9", Bg: "2d2b55", Border: ""},
	"nightowl":             {Title: "c792ea", Icon: "ffeb95", Text: "7fdbca", Bg: "011627", Border: ""},
	"buefy":                {Title: "7957d5", Icon: "ff3860", Text: "363636", Bg: "ffffff", Border: ""},
	"blue-green":           {Title: "2f97c1", Icon: "f5b700", Text: "0cf574", Bg: "040f0f", Border: ""},
	"algolia":              {Title: "00AEFF", Icon: "2DDE98", Text: "FFFFFF", Bg: "050F2C", Border: ""},
	"great-gatsby":         {Title: "ffa726", Icon: "ffb74d", Text: "ffd95b", Bg: "000000", Border: ""},
	"darcula":              {Title: "BA5F17", Icon: "84628F", Text: "BEBEBE", Bg: "242424", Border: ""},
	"bear":                 {Title: "e03c8a", Icon: "00AEFF", Text: "bcb28d", Bg: "1f2023", Border: ""},
	"solarized-dark":       {Title: "268bd2", Icon: "b58900", Text: "859900", Bg: "002b36", Border: ""},
	"solarized-light":      {Title: "268bd2", Icon: "b58900", Text: "859900", Bg: "fdf6e3", Border: ""},
	"chartreuse-dark":      {Title: "7fff00", Icon: "00AEFF", Text: "fff", Bg: "000", Border: ""},
	"nord":                 {Title: "81a1c1", Icon: "88c0d0", Text: "d8dee9", Bg: "2e3440", Border: ""},
	"gotham":               {Title: "2aa889", Icon: "599cab", Text: "99d1ce", Bg: "0c1014", Border: ""},
	"material-palenight":   {Title: "c792ea", Icon: "89ddff", Text: "a6accd", Bg: "292d3e", Border: ""},
	"graywhite":            {Title: "24292e", Icon: "24292e", Text: "24292e", Bg: "ffffff", Border: ""},
	"vision-friendly-dark": {Title: "ffb000", Icon: "785ef0", Text: "ffffff", Bg: "000000", Border: ""},
	"ayu-mirage":           {Title: "f4cd7c", Icon: "73d0ff", Text: "c7c8c2", Bg: "1f2430", Border: ""},
	"midnight-purple":      {Title: "9745f5", Icon: "9f4bff", Text: "ffffff", Bg: "000000", Border: ""},
	"calm":                 {Title: "e07a5f", Icon: "edae49", Text: "ebcfb2", Bg: "373f51", Border: ""},
	"flag-india":           {Title: "ff8f1c", Icon: "250E62", Text: "509E2F", Bg: "ffffff", Border: ""},
	"omni":                 {Title: "FF79C6", Icon: "e7de79", Text: "E1E1E6", Bg: "191622", Border: ""},
	"react":                {Title: "61dafb", Icon: "61dafb", Text: "ffffff", Bg: "20232a", Border: ""},
	"jolly":                {Title: "ff64da", Icon: "a960ff", Text: "ffffff", Bg: "291B3E", Border: ""},
	"maroongold":           {Title: "F7EF8A", Icon: "F7EF8A", Text: "E0AA3E", Bg: "260000", Border: ""},
	"yeblu":                {Title: "ffff00", Icon: "ffff00", Text: "ffffff", Bg: "002046", Border: ""},
	"blueberry":            {Title: "82aaff", Icon: "89ddff", Text: "27e8a7", Bg: "242938", Border: ""},
	"slateorange":          {Title: "faa627", Icon: "faa627", Text: "ffffff", Bg: "36393f", Border: ""},
	"kacho_ga":             {Title: "bf4a3f", Icon: "a64833", Text: "d9c8a9", Bg: "402b23", Border: ""},
	"outrun":               {Title: "ffcc00", Icon: "ff1aff", Text: "8080ff", Bg: "141439", Border: ""},
	"ocean_dark":           {Title: "8957B2", Icon: "FFFFFF", Text: "92D534", Bg: "151A28", Border: ""},
	"city_lights":          {Title: "5D8CB3", Icon: "4798FF", Text: "718CA1", Bg: "1D252C", Border: ""},
	"github_dark":          {Title: "58A6FF", Icon: "1F6FEB", Text: "C3D1D9", Bg: "0D1117", Border: ""},
	"github_dark_dimmed":   {Title: "539bf5", Icon: "539bf5", Text: "ADBAC7", Bg: "24292F", Border: "373E47"},
	"discord_old_blurple":  {Title: "7289DA", Icon: "7289DA", Text: "FFFFFF", Bg: "2C2F33", Border: ""},
	"aura_dark":            {Title: "ff7372", Icon: "6cffd0", Text: "dbdbdb", Bg: "252334", Border: ""},
	"panda":                {Title: "19f9d899", Icon: "19f9d899", Text: "FF75B5", Bg: "31353a", Border: ""},
	"noctis_minimus":       {Title: "d3b692", Icon: "72b7c0", Text: "c5cdd3", Bg: "1b2932", Border: ""},
	"cobalt2":              {Title: "ffc600", Icon: "ffffff", Text: "0088ff", Bg: "193549", Border: ""},
	"swift":                {Title: "000000", Icon: "f05237", Text: "000000", Bg: "f7f7f7", Border: ""},
	"aura":                 {Title: "a277ff", Icon: "ffca85", Text: "61ffca", Bg: "15141b", Border: ""},
	"apprentice":           {Title: "ffffff", Icon: "ffffaf", Text: "bcbcbc", Bg: "262626", Border: ""},
	"moltack":              {Title: "86092C", Icon: "86092C", Text: "574038", Bg: "F5E1C0", Border: ""},
	"codeSTACKr":           {Title: "ff652f", Icon: "FFE400", Text: "ffffff", Bg: "09131B", Border: "0c1a25"},
	"rose_pine":            {Title: "9ccfd8", Icon: "ebbcba", Text: "e0def4", Bg: "191724", Border: ""},
	"catppuccin_latte":     {Title: "137980", Icon: "8839ef", Text: "4c4f69", Bg: "eff1f5", Border: ""},
	"catppuccin_mocha":     {Title: "94e2d5", Icon: "cba6f7", Text: "cdd6f4", Bg: "1e1e2e", Border: ""},
	"date_night":           {Title: "DA7885", Icon: "BB8470", Text: "E1B2A2", Bg: "170F0C", Border: "170F0C"},
	"one_dark_pro":         {Title: "61AFEF", Icon: "C678DD", Text: "E5C06E", Bg: "23272E", Border: "3B4048"},
	"rose":                 {Title: "8d192b", Icon: "B71F36", Text: "862931", Bg: "e9d8d4", Border: "e9d8d4"},
	"holi":                 {Title: "5FABEE", Icon: "5FABEE", Text: "D6E7FF", Bg: "030314", Border: "85A4C0"},
	"neon":                 {Title: "00EAD3", Icon: "00EAD3", Text: "FF449F", Bg: "000000", Border: "ffffff"},
	"blue_navy":            {Title: "82AAFF", Icon: "82AAFF", Text: "82AAFF", Bg: "000000", Border: "ffffff"},
	"calm_pink":            {Title: "e07a5f", Icon: "ebcfb2", Text: "edae49", Bg: "2b2d40", Border: "e1bc29"},
	"ambient_gradient":     {Title: "ffffff", Icon: "ffffff", Text: "ffffff", Bg: "35,4158d0,c850c0,ffcc70", Border: ""},
}

func OptionsFromQuery(q map[string][]string) Options {
	get := func(key string) string {
		if values := q[key]; len(values) > 0 {
			return values[0]
		}
		return ""
	}
	themeName := get("theme")
	if themeName == "" {
		themeName = "default"
	}
	theme, ok := builtinThemes[themeName]
	if !ok {
		themeName = "default"
		theme = builtinThemes["default"]
	}
	border := theme.Border
	if border == "" {
		border = builtinThemes["default"].Border
	}
	ring := theme.Ring
	if ring == "" {
		ring = theme.Title
	}
	return Options{
		TitleColor:      normalizeColor(get("title_color"), "#"+theme.Title),
		TextColor:       normalizeColor(get("text_color"), "#"+theme.Text),
		IconColor:       normalizeColor(get("icon_color"), "#"+theme.Icon),
		BgColor:         normalizeBgColor(get("bg_color"), "#"+theme.Bg),
		BorderColor:     normalizeColor(get("border_color"), "#"+border),
		RingColor:       normalizeColor(get("ring_color"), "#"+ring),
		HideBorder:      parseBool(get("hide_border")),
		HideTitle:       parseBool(get("hide_title")),
		ShowIcons:       parseBool(get("show_icons")),
		TextBold:        get("text_bold") == "" || parseBool(get("text_bold")),
		HideProgress:    parseBool(get("hide_progress")),
		HideRank:        parseBool(get("hide_rank")),
		DisableAnim:     parseBool(get("disable_animations")),
		CustomTitle:     get("custom_title"),
		Theme:           themeName,
		ThemeProvided:   get("theme") != "",
		RankIcon:        defaultString(get("rank_icon"), "default"),
		Layout:          defaultString(get("layout"), "normal"),
		StatsFormat:     defaultString(get("stats_format"), "percentages"),
		DisplayFormat:   defaultString(get("display_format"), "percent"),
		NumberFormat:    defaultString(get("number_format"), "short"),
		NumberPrecision: parseIntDefault(get("number_precision"), 1),
		CardWidth:       parseIntDefault(get("card_width"), 0),
		LineHeight:      parseIntDefault(get("line_height"), 25),
		BorderRadius:    parseFloatDefault(get("border_radius"), 4.5),
		HideStats:       parseCSV(get("hide")),
		ShowStats:       parseCSV(get("show")),
	}
}

const baseSVGStyle = `.title{font:600 18px 'Segoe UI',Ubuntu,Sans-Serif;fill:%s}
.stat{font:600 14px 'Segoe UI',Ubuntu,Sans-Serif;fill:%s}.regular{font-weight:400}.bold{font-weight:700}
.label{font:600 13px 'Segoe UI',Ubuntu,Sans-Serif;fill:%s}
.value{font:600 13px 'Segoe UI',Ubuntu,Sans-Serif;fill:%s}
.muted{font:400 12px 'Segoe UI',Ubuntu,Sans-Serif;fill:%s}
.desc{font:400 13px 'Segoe UI',Ubuntu,Sans-Serif;fill:%s}
.rank{font:700 38px 'Segoe UI',Ubuntu,Sans-Serif;fill:%s}
.rank-percentile{font:700 16px 'Segoe UI',Ubuntu,Sans-Serif;fill:%s}
.icon{fill:%s}.lang-name{font:400 13px 'Segoe UI',Ubuntu,Sans-Serif;fill:%s}
.metric-value{font:700 24px 'Segoe UI',Ubuntu,Sans-Serif;fill:%s}.metric-small{font:700 15px 'Segoe UI',Ubuntu,Sans-Serif;fill:%s}
.micro{font:400 10px 'Segoe UI',Ubuntu,Sans-Serif;fill:%s}.activity-title{font:400 12px 'Segoe UI',Ubuntu,Sans-Serif;fill:%s}
.rank-circle-rim{stroke:%s;fill:none;stroke-width:6;opacity:.2}.rank-circle{stroke:%s;fill:none;stroke-width:6;stroke-linecap:round;opacity:.85}`

func renderStyle(opts Options) string {
	return fmt.Sprintf(baseSVGStyle,
		opts.TitleColor, opts.TextColor, opts.TextColor, opts.IconColor,
		opts.TextColor, opts.TextColor, opts.TitleColor, opts.TextColor,
		opts.IconColor, opts.TextColor, opts.TitleColor, opts.TextColor,
		opts.TextColor, opts.TextColor, opts.RingColor, opts.RingColor,
	)
}
