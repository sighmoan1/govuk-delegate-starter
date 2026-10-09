const KEY_PATTERN = /^[\x21-\x7e]{1,128}$/; // visible ASCII, no spaces, up to 128 characters

export const isValidKey = (key: string) => KEY_PATTERN.test(key);
