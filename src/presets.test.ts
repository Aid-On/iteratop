/**
 * IteratoP - Preset Tests
 */

import { DEFAULT_PRESETS, iterationBuilder, type PresetName } from './builder';
import { createActionResult, createEvaluation } from './utils';

describe('Preset configurations', () => {
  describe('DEFAULT_PRESETS export', () => {
    it('should export all preset configurations', () => {
      expect(DEFAULT_PRESETS).toBeDefined();
      expect(DEFAULT_PRESETS.fast).toBeDefined();
      expect(DEFAULT_PRESETS.thorough).toBeDefined();
      expect(DEFAULT_PRESETS.balanced).toBeDefined();
      expect(DEFAULT_PRESETS['cost-optimized']).toBeDefined();
    });

    it('should have correct values for fast preset', () => {
      expect(DEFAULT_PRESETS.fast).toEqual({
        maxIterations: 3,
        targetScore: 60,
        earlyStopScore: 80,
        minIterations: 1,
        skipMinIterations: true,
      });
    });

    it('should have correct values for thorough preset', () => {
      expect(DEFAULT_PRESETS.thorough).toEqual({
        maxIterations: 10,
        targetScore: 90,
        earlyStopScore: 98,
        minIterations: 3,
        skipMinIterations: false,
      });
    });

    it('should have correct values for cost-optimized preset', () => {
      expect(DEFAULT_PRESETS['cost-optimized']).toMatchObject({
        maxIterations: 3,
        skipMinIterations: true,
        alwaysRunTransition: false,
      });
    });
  });

  describe('Type safety for preset names', () => {
    it('should accept valid preset names', () => {
      const validPresets: PresetName[] = ['fast', 'thorough', 'balanced', 'cost-optimized'];
      
      validPresets.forEach(preset => {
        expect(() => {
          iterationBuilder()
            .initialize(async () => ({}))
            .act(async () => createActionResult(null))
            .evaluate(async () => createEvaluation(100))
            .transition(async (state) => state)
            .finalize(async () => null)
            .preset(preset)
            .build();
        }).not.toThrow();
      });
    });
  });

  describe('Custom presets', () => {
    it('should apply custom preset configuration', () => {
      const myCustomPreset = {
        maxIterations: 7,
        targetScore: 85,
        earlyStopScore: 92,
        minIterations: 2,
        verbose: true,
      };

      const processor = iterationBuilder()
        .initialize(async () => ({}))
        .act(async () => createActionResult(null))
        .evaluate(async () => createEvaluation(100))
        .transition(async (state) => state)
        .finalize(async () => null)
        .customPreset(myCustomPreset)
        .build();

      const config = processor.getConfig();
      expect(config.maxIterations).toBe(7);
      expect(config.targetScore).toBe(85);
      expect(config.earlyStopScore).toBe(92);
      expect(config.minIterations).toBe(2);
      expect(config.verbose).toBe(true);
    });

    it('should allow combining presets with custom configuration', () => {
      const processor = iterationBuilder()
        .initialize(async () => ({}))
        .act(async () => createActionResult(null))
        .evaluate(async () => createEvaluation(100))
        .transition(async (state) => state)
        .finalize(async () => null)
        .preset('fast')
        .customPreset({ verbose: true, timeout: 5000 })
        .build();

      const config = processor.getConfig();
      expect(config.maxIterations).toBe(3); // From 'fast' preset
      expect(config.targetScore).toBe(60); // From 'fast' preset
      expect(config.verbose).toBe(true); // From custom preset
      expect(config.timeout).toBe(5000); // From custom preset
    });
  });

  describe('Preset documentation', () => {
    it('should be able to iterate over all presets programmatically', () => {
      const allPresetNames = Object.keys(DEFAULT_PRESETS) as PresetName[];
      
      // Useful for documentation generation
      const presetDocs = allPresetNames.map(name => ({
        name,
        config: DEFAULT_PRESETS[name],
        description: getPresetDescription(name),
      }));

      expect(presetDocs).toHaveLength(4);
      expect(presetDocs[0].name).toBe('fast');
      expect(presetDocs[0].config).toBeDefined();
    });

    it('should be able to create derived presets', () => {
      // Users can create their own presets based on defaults
      const myPresets = {
        ...DEFAULT_PRESETS,
        'ultra-fast': {
          ...DEFAULT_PRESETS.fast,
          maxIterations: 2,
          targetScore: 50,
        },
        'ultra-thorough': {
          ...DEFAULT_PRESETS.thorough,
          maxIterations: 15,
          targetScore: 95,
        },
      };

      expect(myPresets['ultra-fast'].maxIterations).toBe(2);
      expect(myPresets['ultra-fast'].earlyStopScore).toBe(80); // Inherited from 'fast'
      expect(myPresets['ultra-thorough'].maxIterations).toBe(15);
    });
  });
});

// Helper function for documentation
function getPresetDescription(preset: PresetName): string {
  const descriptions: Record<PresetName, string> = {
    fast: 'Minimal iterations, quick convergence',
    thorough: 'More iterations, higher quality',
    balanced: 'Default balanced approach',
    'cost-optimized': 'Minimize API calls and costs',
  };
  return descriptions[preset];
}