package handler

const errorCacheSeconds = 10 * 60

type cachePolicy struct{ Default, Min, Max int }

var cachePolicies = map[string]cachePolicy{
	"stats":                {Default: 24 * 60 * 60, Min: 12 * 60 * 60, Max: 2 * 24 * 60 * 60},
	"topLangs":             {Default: 6 * 24 * 60 * 60, Min: 2 * 24 * 60 * 60, Max: 10 * 24 * 60 * 60},
	"pin":                  {Default: 10 * 24 * 60 * 60, Min: 24 * 60 * 60, Max: 10 * 24 * 60 * 60},
	"gist":                 {Default: 2 * 24 * 60 * 60, Min: 24 * 60 * 60, Max: 10 * 24 * 60 * 60},
	"wakatime":             {Default: 24 * 60 * 60, Min: 12 * 60 * 60, Max: 2 * 24 * 60 * 60},
	"streak":               {Default: 12 * 60 * 60, Min: 60 * 60, Max: 2 * 24 * 60 * 60},
	"profileSummary":       {Default: 24 * 60 * 60, Min: 6 * 60 * 60, Max: 3 * 24 * 60 * 60},
	"contributionCalendar": {Default: 12 * 60 * 60, Min: 60 * 60, Max: 2 * 24 * 60 * 60},
	"recentActivity":       {Default: 60 * 60, Min: 5 * 60, Max: 12 * 60 * 60},
	"repoLanguages":        {Default: 24 * 60 * 60, Min: 6 * 60 * 60, Max: 3 * 24 * 60 * 60},
	"organization":         {Default: 24 * 60 * 60, Min: 6 * 60 * 60, Max: 3 * 24 * 60 * 60},
}
