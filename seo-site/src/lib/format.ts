import { getPosterUrl as sharedGetPosterUrl, parseList } from '../../../src/shared/formatters';
import type { MovieRow } from './types';


export { parseList };

export function getPosterUrl(movie: Pick<MovieRow, 'slug'>): string {
  return sharedGetPosterUrl(movie.slug);
}

