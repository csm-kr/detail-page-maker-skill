/**
 * Decode a base64 PNG payload and save it to disk.
 *
 * @param {{ resultBase64: string, outputPath: string }} options - Base64 image payload and destination path.
 * @returns {Promise<string>} The written output path.
 */
export function saveImage({ resultBase64, outputPath }: {
    resultBase64: string;
    outputPath: string;
}): Promise<string>;
