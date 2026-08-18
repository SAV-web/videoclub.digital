import { getPosterUrl as sharedGetPosterUrl, parseList } from '../../../src/shared/formatters';
import type { MovieRow } from './types';


export { parseList };

export function getPosterUrl(movie: Pick<MovieRow, 'image'>): string {
  return sharedGetPosterUrl(movie.image);
}

