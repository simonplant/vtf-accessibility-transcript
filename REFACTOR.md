# VTF Audio Extension - Refactor Documentation

## Master Coordinator Prompt

You are the master architect coordinating a systematic refactor of a Chrome extension. Your role is to:
1. Track refactor progress across multiple implementation chats
2. Ensure consistency between modules
3. Manage dependencies and integration points
4. Provide guidance on implementation order

### Project Status Tracking

✅ Phase 1: Foundation - COMPLETE

✅ vtf-globals-finder.js
✅ vtf-stream-monitor.js
✅ vtf-state-monitor.js
✅ Test harness setup

✅ Phase 2: Audio Pipeline - COMPLETE

✅ audio-worklet.js
✅ vtf-audio-capture.js
✅ audio-data-transfer.js
✅ vtf-audio-worklet-node.js
✅ ScriptProcessor fallback
✅ NEW test-audio-data-transfer.js
✅ NEW test-vtf-audio-capture.js

✅ Phase 3: Core Integration - COMPLETE

✅ content.js (new)
✅ background.js (enhanced)
✅ Remove inject.js

✅ Phase 4: Testing & Migration - COMPLETE

✅ NEW Integration tests (test-vtf-integration.js)
✅ Migration scripts (legacy message mapping)
✅ Documentation

### Your Responsibilities

1. **Dependency Management**: Tell workers what interfaces they must implement
2. **Integration Points**: Define how modules connect
3. **Progress Tracking**: Update checkboxes as modules complete
4. **Consistency Enforcement**: Ensure naming, logging, error handling patterns
5. **Test Coordination**: Verify each module is testable in isolation

### Module Interface Specifications

When a worker asks for requirements, provide:
- Exact class/function signatures needed
- Expected input/output formats
- Error handling requirements
- Logging format: `[ModuleName] message`
- Test requirements

### Integration Guidelines

Each module must:
1. Export a single class or object
2. Have zero direct dependencies on other refactored modules (use events/callbacks)
3. Include comprehensive error handling
4. Provide a `.debug()` method for testing
5. Be testable in isolation

When asked "what should I work on next?", check dependencies and recommend the next logical module.

## Worker Prompt Templates

### Template 1: Foundation Module Worker

#### Implement VTF Foundation Module: [MODULE_NAME]

Implement the [MODULE_NAME] module according to the VTF Audio Extension Design Document v3.0.

##### Module: [MODULE_NAME]
File: `src/modules/[filename].js`

##### Requirements from Design Document
[Copy relevant section from design doc]

##### Interface Requirements
This module must export:
```javascript
class [ClassName] {
  constructor() { }
  
  // Required methods:
  [List from design doc]
  
  // Required events:
  [Any events this emits]
}
```

##### Dependencies
- No imports from other refactored modules
- Can use: Chrome APIs, Web APIs
- Must work standalone

##### Implementation Requirements

1. **Error Handling**: 
   - Never throw uncaught errors
   - Return null/false on failure
   - Log all errors with context

2. **Logging Format**:
   ```javascript
   console.log('[ModuleName] Operation successful');
   console.error('[ModuleName] Failed to X:', error);
   ```

3. **Testing Support**:
   - Add `.debug()` method that returns internal state
   - Make timeouts/intervals configurable
   - Provide manual trigger methods for testing

4. **Memory Management**:
   - Clean up all listeners
   - Clear timeouts/intervals
   - Provide `.destroy()` method

##### Deliverables

1. **Main Implementation** (`[filename].js`)
2. **Test File** (`test-[module].js`) with:
   - Standalone test functions
   - Mock VTF environment
   - Success and failure scenarios
3. **Usage Example** showing integration

##### Success Criteria
- Works without other refactored modules
- Handles all error cases gracefully  
- Can be tested via console
- Follows design document exactly

### Template 2: Audio Processing Worker

#### Implement VTF Audio Module: [MODULE_NAME]

Implement audio processing module for VTF Chrome Extension refactor.

##### Module: [MODULE_NAME]
File: `src/modules/[filename].js`

##### Audio Requirements
- Sample Rate: 16000 Hz (Whisper optimal)
- Buffer Size: 4096 samples
- Format: Float32Array (convert to Int16 for transfer)
- Channels: Mono

##### Implementation from Design Document
[Copy relevant section]

##### Special Considerations

1. **AudioWorklet vs ScriptProcessor**:
   - Implement AudioWorklet as primary
   - Provide ScriptProcessor fallback
   - Runtime detection of support

2. **Performance**:
   - Process on audio thread when possible
   - Minimize main thread blocking
   - Efficient buffer management

3. **Browser Compatibility**:
   - Test AudioContext prefix variants
   - Handle suspended context state
   - Graceful degradation

##### Audio-Specific Testing
Include test for:
- Silent audio (should skip)
- Loud audio (clipping)
- Stream disconnection
- Context suspension

##### Deliverable Structure
```javascript
class [ClassName] {
  async initialize() {
    // Set up audio context
    // Detect worklet support
  }
  
  async capture(element, stream, userId) {
    // Main capture logic
  }
  
  stop(userId) {
    // Cleanup
  }
}
```

### Template 3: Integration Worker

#### Integrate VTF Modules: content.js

Create the main content script that integrates all refactored modules.

##### Integration Requirements

###### Modules to Import
```javascript
// Foundation modules (already implemented)
import { VTFGlobalsFinder } from './modules/vtf-globals-finder.js';
import { VTFStreamMonitor } from './modules/vtf-stream-monitor.js';
import { VTFStateMonitor } from './modules/vtf-state-monitor.js';

// Audio modules (already implemented)  
import { VTFAudioCapture } from './modules/vtf-audio-capture.js';
import { AudioDataTransfer } from './modules/audio-data-transfer.js';
```

###### Expected Module Interfaces
[List what each module exports based on previous implementations]

##### Integration Logic

1. **Initialization Sequence**:
   - Wait for DOM ready
   - Initialize VTFGlobalsFinder
   - Set up audio subsystem
   - Start monitoring

2. **Event Coordination**:
   - Module A emits event → Module B responds
   - No direct module coupling
   - Central event bus if needed

3. **Error Boundaries**:
   - Each module failure shouldn't crash others
   - Graceful degradation
   - User notification on critical failure

##### Migration from Legacy
- Map old message types to new
- Preserve storage keys
- Maintain API compatibility

##### Testing the Integration
Provide test scenarios:
1. Cold start (no VTF loaded)
2. Hot reload (VTF already active)
3. Module failure recovery
4. Multi-user audio streams

### Template 4: Test Coordinator Worker

#### Create Integration Tests for VTF Extension

Build comprehensive test suite for refactored modules.

##### Test Requirements

###### Unit Tests Completed
- [ ] vtf-globals-finder.js ✓
- [ ] vtf-stream-monitor.js ✓
- [ ] vtf-audio-capture.js ✓
[List based on actual progress]

###### Integration Tests Needed
1. **Globals + Monitor**: Can they work together?
2. **Monitor + Capture**: Stream handoff working?
3. **Full Pipeline**: Audio element → Transcription

##### Test Environment Setup

Create `test/integration/test-environment.html`:
- Mock VTF DOM structure
- Simulate MediaSoup patterns
- Controllable timing

##### Test Scenarios

###### Scenario 1: Happy Path
```javascript
// 1. VTF globals present
// 2. Audio element added
// 3. Stream assigned
// 4. Capture starts
// 5. Data flows to background
```

###### Scenario 2: Recovery Testing
```javascript
// 1. Start normally
// 2. Simulate reconnectAudio()
// 3. Verify cleanup
// 4. Verify resume
```

###### Scenario 3: Edge Cases
- Globals not found (30s timeout)
- Stream never assigned
- Multiple rapid reconnects
- Memory pressure

##### Deliverables
1. Integration test suite
2. Test runner HTML page
3. Performance benchmarks
4. Test results documentation

## How to Use These Prompts

### Workflow

1. **Start with Master**: 
   ```
   "I'm beginning the VTF extension refactor. What module should I implement first?"
   ```

2. **New Chat per Module**: 
   ```
   "Using Worker Template 1: Implement VTF Foundation Module: VTFGlobalsFinder"
   ```

3. **Return to Master**:
   ```
   "VTFGlobalsFinder is complete and tested. What's next?"
   ```

4. **Integration Phase**:
   ```
   "Modules X, Y, Z are complete. Ready for integration."
   ```

### Best Practices

1. **One module per chat** - Keeps context focused
2. **Test before moving on** - Each module standalone
3. **Update master regularly** - Track progress
4. **Document interfaces** - What each module exports
5. **Version control commits** - One commit per module

### Example Sequence

```bash
# Chat 1 (Master)
"Starting refactor, what's first?"
→ "Start with VTFGlobalsFinder"

# Chat 2 (Worker)
"Implement VTFGlobalsFinder per design doc"
→ Implementation + tests

# Chat 1 (Master)
"VTFGlobalsFinder done, what's next?"
→ "Now implement VTFStreamMonitor"

# Chat 3 (Worker)
"Implement VTFStreamMonitor per design doc"
→ Implementation + tests

# Continue until all modules done...

# Chat 1 (Master)
"All modules complete, ready for integration"
→ "Create content.js to integrate modules"
```

This approach gives you:
- Clear separation of concerns
- Trackable progress
- Consistent implementation
- Easy testing
- Clean git history