package service

import "fmt"

// ValidationError is a client-correctable input/state error; Msg is safe to show to clients.
type ValidationError struct{ Msg string }

func (e *ValidationError) Error() string { return e.Msg }

func validationf(format string, a ...any) error {
	return &ValidationError{Msg: fmt.Sprintf(format, a...)}
}
