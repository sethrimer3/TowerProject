/** Plays one ad, resolving once it has played to the end (true) or
 * failed or been cut short (false). No ad network is connected yet, so
 * every ad "plays" at once: this is where one will be hooked up. */
export async function playAd(): Promise<boolean> {
  return true;
}
