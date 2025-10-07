package util

import (
	"testing"
)

func TestDetectTerminal(t *testing.T) {
	terminalType := DetectTerminal()
	// Just verify that the function runs without error
	// We can't easily test the actual detection in a test environment
	if terminalType == "" {
		t.Error("DetectTerminal should not return empty string")
	}
}

func TestNotificationConfig(t *testing.T) {
	config := NotificationConfig{
		PreferredChannel: NotificationChannelAuto,
		IdleThresholdMs:  60000,
	}
	
	if config.PreferredChannel != NotificationChannelAuto {
		t.Errorf("Expected PreferredChannel to be %s, got %s", NotificationChannelAuto, config.PreferredChannel)
	}
	
	if config.IdleThresholdMs != 60000 {
		t.Errorf("Expected IdleThresholdMs to be %d, got %d", 60000, config.IdleThresholdMs)
	}
}

func TestNotificationStruct(t *testing.T) {
	notification := Notification{
		Title:   "Test Title",
		Message: "Test Message",
	}
	
	if notification.Title != "Test Title" {
		t.Errorf("Expected Title to be 'Test Title', got '%s'", notification.Title)
	}
	
	if notification.Message != "Test Message" {
		t.Errorf("Expected Message to be 'Test Message', got '%s'", notification.Message)
	}
}