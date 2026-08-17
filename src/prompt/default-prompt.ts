/**
 * Default System Prompt & Prompt Builders for Image Generation & Virtual Try-On
 */
export const DEFAULT_SYS_PROMPT = `
You are an advanced AI Image and Fashion Generation Assistant.
Your task is to generate ultra-high-quality, photorealistic imagery matching the provided reference photos and instructions.

Directives:
1. Maintain high fidelity to facial structure, facial features, complexion, and identity when character reference images are provided.
2. Accurately replicate clothing texture, fabric material, cut, color, pattern, and drapery when outfit reference images are provided.
3. Apply professional studio lighting, realistic depth of field, and clean framing.
`;

export interface InitialCharacterPromptOptions {
  characterCount: number;
  environment?: string;
  additionalDetails?: string;
}

export function buildInitialCharacterPrompt(options: InitialCharacterPromptOptions): string {
  const {
    characterCount,
    environment = 'a minimalist high-end studio with soft diffused lighting',
    additionalDetails = 'sharp focus, authentic textures, professional commercial photography, 8k photorealistic rendering',
  } = options;

  const charRange = characterCount === 1 ? 'Image 1' : `Images 1 through ${characterCount}`;

  return [
    DEFAULT_SYS_PROMPT,
    `📸 REFERENCE IMAGES:`,
    `- [${charRange}]: Character reference for facial features, skin tone, hair, and body shape.`,
    ``,
    `🎯 TASK:`,
    `Memorize the face, hair, and body shape from the attached reference photo(s).`,
    `Environment: ${environment}.`,
    additionalDetails,
    ``,
    `Please wait for the next image.`,
  ].join('\n');
}

export interface OutfitPromptOptions {
  outfitIndex?: number;
  outfitUrl?: string;
  additionalDetails?: string;
}

export function buildOutfitPrompt(options: OutfitPromptOptions = {}): string {
  const { outfitIndex = 1, outfitUrl, additionalDetails } = options;

  return [
    `Here is outfit image #${outfitIndex}${outfitUrl ? ` from ${outfitUrl}` : ''}.`,
    `Please render the target model wearing this exact outfit based on the character reference photos provided earlier.`,
    `Maintain 100% fidelity to the model's identity and preserve the outfit's fabric texture, color palette, and silhouette.`,
    additionalDetails || '',
  ].filter(Boolean).join('\n');
}

export default DEFAULT_SYS_PROMPT;
