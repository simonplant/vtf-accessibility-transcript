2. **Run all tests**:
- Click "Run All Tests" button
- Watch the test log for results
- Check module status cards for real-time state

3. **Run individual scenarios**:
- Use the scenario buttons to test specific features
- Each scenario resets the environment first

## Test Scenarios

### 1. Cold Start
Tests module initialization when VTF is not initially present:
- Modules start searching for VTF globals
- VTF globals are added after a delay
- Verifies modules detect and initialize properly

### 2. Hot Start
Tests module initialization when VTF is already loaded:
- VTF environment is pre-configured
- Audio elements already exist
- Verifies immediate detection and setup

### 3. Audio Lifecycle
Tests the complete audio element lifecycle:
- Element creation with VTF ID pattern
- Stream monitor detection
- Stream assignment and validation
- Element removal and cleanup

### 4. State Changes
Tests VTF state change detection:
- Volume adjustments
- Session state transitions
- Reconnect events
- Event emission and handling

### 5. Error Recovery
Tests error handling and recovery:
- Globals detection timeout
- Stream detection timeout
- Invalid stream handling
- Missing dependencies

## Manual Testing

### VTF Actions
- **Reconnect Audio**: Simulates VTF's reconnectAudio behavior
- **Add/Remove Audio**: Create or remove audio elements dynamically
- **Volume Control**: Adjust VTF's global volume
- **Session Control**: Change VTF's session state

### Module Inspection
Each module card shows:
- Current status (Active/Waiting/Error)
- Internal state (JSON display)
- Key metrics (search time, active monitors, etc.)

### Console Access
Open the browser console for direct module access:
```javascript
// Access test harness
testHarness.globalsFinder
testHarness.streamMonitor
testHarness.stateMonitor

// Debug modules
testHarness.globalsFinder.debug()
testHarness.streamMonitor.debug()
testHarness.stateMonitor.debug()

// Simulate VTF behaviors
simulateVTFBehaviors.userJoins('testUser123')
simulateVTFBehaviors.userLeaves('testUser123')
simulateVTFBehaviors.networkGlitch()