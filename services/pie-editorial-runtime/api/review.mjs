import { handleReviewRequest } from '../src/review.mjs';

export default async function handler(request, response) {
  return handleReviewRequest(request, response);
}
