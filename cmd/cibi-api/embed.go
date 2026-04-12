package main

import (
	"embed"
	"io/fs"
)

//go:embed all:web/dist
var webDist embed.FS

// WebDistFS returns the web/dist filesystem as a sub filesystem.
func WebDistFS() (fs.FS, error) {
	return fs.Sub(webDist, "web/dist")
}
