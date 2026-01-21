# Config Migration Script

This script automatically migrates and validates all config files in `src/configs/` to fix common issues and ensure correctness:

## What it does

### Structural Fixes
1. **Removes deprecated elements**: Removes `bayer-dither` (now controlled via ColorConfig)
2. **Removes invalid parameters**: Removes `blockSpacingChaos` and any parameters for non-existent elements
3. **Migrates v1.0 to v2.0**: Converts old single-layer configs to the new multi-layer format
4. **Adds missing fields**: Ensures all configs have `toneMapping` in their colorConfig
5. **Fixes empty files**: Creates a default config for empty files (like `dusty-chalk.json`)
6. **Validates elements**: Removes any references to elements that don't exist in the element library

### Value Validation
7. **Validates parameter ranges**: Clamps parameter values to their min/max ranges
8. **Fixes parameter types**: Rounds float values to integers for `int` type parameters
9. **Validates opacity**: Ensures opacity is in [0, 1] range
10. **Validates blendingMode**: Ensures blendingMode is in [0, 11] range

### Consistency Checks
11. **Removes duplicates**: Removes duplicate elements from `activeElements` and `elementOrder`
12. **Ensures elementOrder completeness**: Adds all valid elements to `elementOrder` if missing
13. **Validates activeElements**: Ensures all `activeElements` are present in `elementOrder`
14. **Validates FX layer**: Ensures FX layer only contains post-processor elements
15. **Validates ColorConfig**: Checks color values are in valid ranges (L: 0-1, C: 0-1, H: 0-360)
16. **Validates toneMapping**: Ensures toneMapping values are non-negative

## Usage

First, install dependencies (if not already installed):
```bash
npm install
```

Then run the script:
```bash
npm run migrate
```

The script will:
- Process all `.json` files in `src/configs/`
- Show what changes were made to each file
- Write the updated configs back to disk

## Example Output

```
🔧 Updating config files...

Valid elements: fbm-noise, fbm-value-noise, rings, vector-field, ...

📄 Processing dusty-chalk.json...
  ✅ Updated:
     - File was empty - created default config

📄 Processing good-glitch.json...
  ✅ Updated (5 changes):
     - Removed deprecated elements: bayer-dither
     - Removed invalid parameters: block-displacement.blockSpacingChaos
     - Clamped fbm-noise.fbmOctaves to valid range
     - Fixed type for sphere-raymarch.raymarchSteps (rounded to int)
     - Layer layer-1: Removed duplicate elements from activeElements

📄 Processing blairwitch.json...
  ✅ Updated (8 changes):
     - Migrated from v1.0 to v2.0
     - Removed deprecated elements: bayer-dither
     - Added missing toneMapping
     - Clamped vector-field.vfAmplitude to valid range
     - Layer layer-1: Added missing elements to elementOrder: glow-bloom, ...
     - FX Layer: Removed non-post-processor elements from FX layer: fbm-noise

✨ Migration Summary:
   Total files:     13
   Updated:         5
   Unchanged:       8
   Failed:          0
   Total changes:   47
```

## Notes

- The script preserves all valid parameters and settings
- It updates the `timestamp` field to the current time
- It ensures all configs are in v2.0 format
- **Value clamping**: Parameters out of range are clamped to min/max, not removed
- **Type fixing**: Float values for int parameters are rounded, not removed
- **Non-destructive**: The script fixes issues but preserves valid data
- Back up your configs before running if you want to be safe (though the script is non-destructive)

## What Gets Fixed

### Parameter Values
- `fbmOctaves: 99` → Clamped to `8` (max value)
- `raymarchSteps: 3.5` → Rounded to `4` (int type)
- `opacity: 1.5` → Clamped to `1.0` (max value)

### Consistency
- Duplicate elements in arrays → Removed
- Missing elements in `elementOrder` → Added
- `activeElements` not in `elementOrder` → Added to `elementOrder`
- Non-post-processors in FX layer → Removed

### Structure
- Invalid elements → Removed
- Invalid parameters → Removed
- Missing `toneMapping` → Added with defaults
- v1.0 format → Migrated to v2.0
