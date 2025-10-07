package util

import (
	"fmt"
	"log/slog"
	"os"
	"os/exec"
	"runtime"
	"strings"
	"time"
)

// NotificationChannel represents the different notification methods available
type NotificationChannel string

const (
	NotificationChannelAuto                  NotificationChannel = "auto"
	NotificationChannelITerm2                NotificationChannel = "iterm2"
	NotificationChannelTerminalBell          NotificationChannel = "terminal_bell"
	NotificationChannelITerm2WithBell        NotificationChannel = "iterm2_with_bell"
	NotificationChannelKitty                 NotificationChannel = "kitty"
	NotificationChannelGhostty               NotificationChannel = "ghostty"
	NotificationChannelNotificationsDisabled NotificationChannel = "notifications_disabled"
)

// NotificationConfig holds configuration for notifications
type NotificationConfig struct {
	PreferredChannel NotificationChannel `toml:"preferred_notification_channel"`
	IdleThresholdMs  int64               `toml:"idle_notification_threshold_ms"`
}

// Notification represents a notification message
type Notification struct {
	Message string
	Title   string
}

// TerminalType represents the detected terminal
type TerminalType string

const (
	TerminalTypeAppleTerminal TerminalType = "Apple_Terminal"
	TerminalTypeITerm2        TerminalType = "iTerm.app"
	TerminalTypeKitty         TerminalType = "kitty"
	TerminalTypeGhostty       TerminalType = "ghostty"
	TerminalTypeUnknown       TerminalType = "unknown"
)

// DetectTerminal detects the current terminal type
func DetectTerminal() TerminalType {
	termProgram := os.Getenv("TERM_PROGRAM")
	if termProgram != "" {
		switch termProgram {
		case "Apple_Terminal":
			return TerminalTypeAppleTerminal
		case "iTerm.app":
			return TerminalTypeITerm2
		case "kitty":
			return TerminalTypeKitty
		case "ghostty":
			return TerminalTypeGhostty
		}
	}

	// Check TERM environment variable
	term := os.Getenv("TERM")
	if strings.Contains(term, "kitty") {
		return TerminalTypeKitty
	}

	// Check for Ghostty-specific environment variables
	if os.Getenv("GHOSTTY_RESOURCES_DIR") != "" {
		return TerminalTypeGhostty
	}

	// Default to unknown
	return TerminalTypeUnknown
}

// IsBellEnabledForAppleTerminal checks if bell is enabled for Apple Terminal
func IsBellEnabledForAppleTerminal() bool {
	if DetectTerminal() != TerminalTypeAppleTerminal {
		return false
	}

	// Run osascript to get current terminal profile
	cmd := exec.Command("osascript", "-e", "tell application \"Terminal\" to name of current settings of front window")
	result, err := cmd.Output()
	if err != nil {
		slog.Debug("Failed to get Apple Terminal profile name", "error", err)
		return false
	}

	profileName := strings.TrimSpace(string(result))
	if profileName == "" {
		return false
	}

	// Run defaults export to get terminal settings
	cmd = exec.Command("defaults", "export", "com.apple.Terminal", "-")
	result, err = cmd.Output()
	if err != nil {
		slog.Debug("Failed to export Apple Terminal defaults", "error", err)
		return false
	}

	// Simple check for bell setting - in Terminal, false means bell is on
	// We'll check if the profile contains "Bell = false" which means it's enabled
	profileSection := fmt.Sprintf("[%s]", profileName)
	lines := strings.Split(string(result), "\n")
	inProfileSection := false

	for _, line := range lines {
		if strings.Contains(line, profileSection) {
			inProfileSection = true
			continue
		}

		if inProfileSection {
			// Look for the Bell setting
			if strings.Contains(line, "Bell = false") {
				return true
			}
			if strings.Contains(line, "Bell = true") {
				return false
			}

			// If we hit another section, stop looking
			if strings.HasPrefix(line, "[") && strings.HasSuffix(line, "]") {
				break
			}
		}
	}

	// Default to true if we can't determine the setting
	return true
}

// RingTerminalBell rings the terminal bell
func RingTerminalBell() {
	os.Stdout.WriteString("\x07")
}

// ShowITerm2Notification shows a notification in iTerm2 using OSC 9
func ShowITerm2Notification(notification Notification) {
	formatted := notification.Message
	if notification.Title != "" {
		formatted = notification.Title + ": " + notification.Message
	}
	os.Stdout.WriteString("\x1B]9;" + formatted + "\x07")
}

// ShowKittyNotification shows a notification in Kitty using OSC 99
func ShowKittyNotification(notification Notification) {
	// Generate a random notification ID
	notificationId := time.Now().UnixNano() % 10000

	heading := "OpenCode"
	if notification.Title != "" {
		heading = notification.Title
	}

	// Send the notification using Kitty's OSC 99 protocol
	os.Stdout.WriteString(fmt.Sprintf("\x1B]99;i=%d:d=0:p=title;%s\x1B\\", notificationId, heading))
	os.Stdout.WriteString(fmt.Sprintf("\x1B]99;i=%d:p=body;%s\x1B\\", notificationId, notification.Message))
	os.Stdout.WriteString(fmt.Sprintf("\x1B]99;i=%d:d=1:a=focus;\x1B\\", notificationId))
}

// ShowGhosttyNotification shows a notification in Ghostty using OSC 777
func ShowGhosttyNotification(notification Notification) {
	heading := "OpenCode"
	if notification.Title != "" {
		heading = notification.Title
	}
	os.Stdout.WriteString("\x1B]777;notify;" + heading + ";" + notification.Message + "\x07")
}

// DispatchNotification dispatches a notification based on the configuration and terminal type
func DispatchNotification(notification Notification, config NotificationConfig) error {
	terminalType := DetectTerminal()

	// If notifications are disabled, don't send anything
	if config.PreferredChannel == NotificationChannelNotificationsDisabled {
		return nil
	}

	// If using auto channel, select based on terminal type
	if config.PreferredChannel == NotificationChannelAuto || config.PreferredChannel == "" {
		switch terminalType {
		case TerminalTypeAppleTerminal:
			if IsBellEnabledForAppleTerminal() {
				RingTerminalBell()
				return nil
			}
		case TerminalTypeITerm2:
			ShowITerm2Notification(notification)
			return nil
		case TerminalTypeKitty:
			ShowKittyNotification(notification)
			return nil
		case TerminalTypeGhostty:
			ShowGhosttyNotification(notification)
			return nil
		default:
			// For unknown terminals, try bell if it's likely to work
			RingTerminalBell()
			return nil
		}
		return nil
	}

	// Handle specific notification channels
	switch config.PreferredChannel {
	case NotificationChannelITerm2:
		ShowITerm2Notification(notification)
	case NotificationChannelTerminalBell:
		RingTerminalBell()
	case NotificationChannelITerm2WithBell:
		ShowITerm2Notification(notification)
		RingTerminalBell()
	case NotificationChannelKitty:
		ShowKittyNotification(notification)
	case NotificationChannelGhostty:
		ShowGhosttyNotification(notification)
	}

	return nil
}

// ShowMacOSNotification displays a notification on macOS using osascript
func ShowMacOSNotification(title, message string) error {
	if runtime.GOOS != "darwin" {
		return nil // Only run on macOS
	}

	script := `display notification "` + message + `" with title "` + title + `"`
	cmd := exec.Command("osascript", "-e", script)
	return cmd.Run()
}
