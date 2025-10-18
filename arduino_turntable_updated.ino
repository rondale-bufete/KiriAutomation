// Updated Arduino code for turntable control with fixed slow speed
// Define L298N pins
const int ENA = 10; // Enable Pin for Motor A (PWM for speed)
const int IN3 = 9;  // Input Pin 1
const int IN4 = 8;  // Input Pin 2

// Fixed slow speed for smooth rotation
const int TURNTABLE_SPEED = 5; // Fixed slow speed (0-255)

void setup()
{
  // Set all control pins as outputs
  pinMode(ENA, OUTPUT);
  pinMode(IN3, OUTPUT);
  pinMode(IN4, OUTPUT);

  // Initialize Serial communication at 9600 baud
  Serial.begin(9600);

  // Start stopped
  analogWrite(ENA, 0);
  
  Serial.println("Turntable Ready");
}

void loop()
{
  if (Serial.available())
  {
    // Read the incoming command character
    char command = Serial.read();
    
    Serial.println("Received: " + String(command));
    handleCommand(command);
  }
}

void handleCommand(char command) {
  switch (command)
  {
    case 'F': // Forward
      // Set direction: HIGH/LOW
      digitalWrite(IN3, HIGH);
      digitalWrite(IN4, LOW);
      // Set fixed slow speed
      analogWrite(ENA, TURNTABLE_SPEED);
      Serial.println("Forward at fixed slow speed: " + String(TURNTABLE_SPEED));
      break;

    case 'S': // Stop
      // Stop movement by disabling the motor
      analogWrite(ENA, 0);
      // Ensure inputs are LOW to avoid confusion
      digitalWrite(IN3, LOW);
      digitalWrite(IN4, LOW);
      Serial.println("Stopped");
      break;

    default:
      Serial.println("Unknown command: " + String(command));
      break;
  }
}
