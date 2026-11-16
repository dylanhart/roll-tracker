export const SUPPORTED_DICE = [20, 10000] as const;
export type DieFaces = (typeof SUPPORTED_DICE)[number];

export function isSupportedDie(faces: unknown): faces is DieFaces {
    return SUPPORTED_DICE.some((supported) => supported === faces);
}
