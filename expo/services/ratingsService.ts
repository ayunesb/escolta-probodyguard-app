import { collection, doc, addDoc, updateDoc, getDocs, query, where, orderBy, limit } from 'firebase/firestore';
import { db as getDbInstance } from '@/lib/firebase';
import { RatingBreakdown } from '@/types';
import { logger } from '@/utils/logger';
import i18n from '@/i18n';

export interface Review {
  id: string;
  bookingId: string;
  guardId: string;
  clientId: string;
  rating: number;
  ratingBreakdown: RatingBreakdown;
  review: string;
  photos?: string[];
  helpful: number;
  notHelpful: number;
  response?: {
    text: string;
    respondedAt: string;
  };
  createdAt: string;
  updatedAt?: string;
}

export interface GuardRatingStats {
  guardId: string;
  overallRating: number;
  totalReviews: number;
  ratingDistribution: {
    5: number;
    4: number;
    3: number;
    2: number;
    1: number;
  };
  averageBreakdown: RatingBreakdown;
  recentReviews: Review[];
  responseRate: number;
}

export const ratingsService = {
  async submitRating(
    bookingId: string,
    guardId: string,
    clientId: string,
    rating: number,
    ratingBreakdown: RatingBreakdown,
    review: string,
    photos?: string[]
  ): Promise<string | null> {
    try {
      logger.log('[Ratings] Submitting rating for booking:', bookingId);

      const reviewData = {
        bookingId,
        guardId,
        clientId,
        rating,
        ratingBreakdown,
        review,
        photos: photos || [],
        helpful: 0,
        notHelpful: 0,
        createdAt: new Date().toISOString(),
      };

      const reviewRef = await addDoc(collection(getDbInstance(), 'reviews'), reviewData);

      await updateDoc(doc(getDbInstance(), 'bookings', bookingId), {
        rating,
        ratingBreakdown,
        review,
        ratedAt: new Date().toISOString(),
      });

      await this.updateGuardRating(guardId);

      logger.log('[Ratings] Rating submitted:', reviewRef.id);
      return reviewRef.id;
    } catch (error) {
      logger.error('[Ratings] Error submitting rating:', error);
      return null;
    }
  },

  async updateGuardRating(guardId: string): Promise<void> {
    try {
      const reviewsQuery = query(
        collection(getDbInstance(), 'reviews'),
        where('guardId', '==', guardId)
      );

      const snapshot = await getDocs(reviewsQuery);
      const reviews: Review[] = [];

      snapshot.forEach((doc) => {
        reviews.push({
          id: doc.id,
          ...doc.data(),
        } as Review);
      });

      if (reviews.length === 0) {
        return;
      }

      const totalRating = reviews.reduce((sum, r) => sum + r.rating, 0);
      const overallRating = totalRating / reviews.length;

      const breakdownSums = {
        professionalism: 0,
        punctuality: 0,
        communication: 0,
        languageClarity: 0,
      };

      reviews.forEach((review) => {
        breakdownSums.professionalism += review.ratingBreakdown.professionalism;
        breakdownSums.punctuality += review.ratingBreakdown.punctuality;
        breakdownSums.communication += review.ratingBreakdown.communication;
        breakdownSums.languageClarity += review.ratingBreakdown.languageClarity;
      });

      const averageBreakdown: RatingBreakdown = {
        professionalism: breakdownSums.professionalism / reviews.length,
        punctuality: breakdownSums.punctuality / reviews.length,
        communication: breakdownSums.communication / reviews.length,
        languageClarity: breakdownSums.languageClarity / reviews.length,
      };

      await updateDoc(doc(getDbInstance(), 'users', guardId), {
        rating: overallRating,
        ratingBreakdown: averageBreakdown,
        totalReviews: reviews.length,
        lastRatingUpdate: new Date().toISOString(),
      });

      logger.log('[Ratings] Guard rating updated:', { guardId, overallRating });
    } catch (error) {
      logger.error('[Ratings] Error updating guard rating:', { error });
    }
  },

  async getGuardRatingStats(guardId: string): Promise<GuardRatingStats | null> {
    try {
      const reviewsQuery = query(
        collection(getDbInstance(), 'reviews'),
        where('guardId', '==', guardId),
        orderBy('createdAt', 'desc')
      );

      const snapshot = await getDocs(reviewsQuery);
      const reviews: Review[] = [];

      snapshot.forEach((doc) => {
        reviews.push({
          id: doc.id,
          ...doc.data(),
        } as Review);
      });

      if (reviews.length === 0) {
        return null;
      }

      const totalRating = reviews.reduce((sum, r) => sum + r.rating, 0);
      const overallRating = totalRating / reviews.length;

      const ratingDistribution = {
        5: reviews.filter((r) => r.rating === 5).length,
        4: reviews.filter((r) => r.rating === 4).length,
        3: reviews.filter((r) => r.rating === 3).length,
        2: reviews.filter((r) => r.rating === 2).length,
        1: reviews.filter((r) => r.rating === 1).length,
      };

      const breakdownSums = {
        professionalism: 0,
        punctuality: 0,
        communication: 0,
        languageClarity: 0,
      };

      reviews.forEach((review) => {
        breakdownSums.professionalism += review.ratingBreakdown.professionalism;
        breakdownSums.punctuality += review.ratingBreakdown.punctuality;
        breakdownSums.communication += review.ratingBreakdown.communication;
        breakdownSums.languageClarity += review.ratingBreakdown.languageClarity;
      });

      const averageBreakdown: RatingBreakdown = {
        professionalism: breakdownSums.professionalism / reviews.length,
        punctuality: breakdownSums.punctuality / reviews.length,
        communication: breakdownSums.communication / reviews.length,
        languageClarity: breakdownSums.languageClarity / reviews.length,
      };

      const reviewsWithResponses = reviews.filter((r) => r.response).length;
      const responseRate = (reviewsWithResponses / reviews.length) * 100;

      return {
        guardId,
        overallRating,
        totalReviews: reviews.length,
        ratingDistribution,
        averageBreakdown,
        recentReviews: reviews.slice(0, 10),
        responseRate,
      };
    } catch (error) {
      logger.error('[Ratings] Error getting rating stats:', error);
      return null;
    }
  },

  async getGuardReviews(
    guardId: string,
    limitCount: number = 20
  ): Promise<Review[]> {
    try {
      const reviewsQuery = query(
        collection(getDbInstance(), 'reviews'),
        where('guardId', '==', guardId),
        orderBy('createdAt', 'desc'),
        limit(limitCount)
      );

      const snapshot = await getDocs(reviewsQuery);
      const reviews: Review[] = [];

      snapshot.forEach((doc) => {
        reviews.push({
          id: doc.id,
          ...doc.data(),
        } as Review);
      });

      return reviews;
    } catch (error) {
      logger.error('[Ratings] Error getting reviews:', error);
      return [];
    }
  },

  async respondToReview(
    reviewId: string,
    responseText: string
  ): Promise<boolean> {
    try {
      await updateDoc(doc(getDbInstance(), 'reviews', reviewId), {
        response: {
          text: responseText,
          respondedAt: new Date().toISOString(),
        },
        updatedAt: new Date().toISOString(),
      });

      logger.log('[Ratings] Response added to review:', reviewId);
      return true;
    } catch (error) {
      logger.error('[Ratings] Error responding to review:', error);
      return false;
    }
  },

  async markReviewHelpful(
    reviewId: string,
    isHelpful: boolean
  ): Promise<boolean> {
    try {
      const reviewRef = doc(getDbInstance(), 'reviews', reviewId);
      const field = isHelpful ? 'helpful' : 'notHelpful';

      const reviewDoc = await getDocs(
        query(collection(getDbInstance(), 'reviews'), where('__name__', '==', reviewId))
      );

      if (!reviewDoc.empty) {
        const currentValue = reviewDoc.docs[0].data()[field] || 0;
        await updateDoc(reviewRef, {
          [field]: currentValue + 1,
        });
        return true;
      }

      return false;
    } catch (error) {
      logger.error('[Ratings] Error marking review helpful:', error);
      return false;
    }
  },

  async getClientRatingHistory(clientId: string): Promise<Review[]> {
    try {
      const reviewsQuery = query(
        collection(getDbInstance(), 'reviews'),
        where('clientId', '==', clientId),
        orderBy('createdAt', 'desc')
      );

      const snapshot = await getDocs(reviewsQuery);
      const reviews: Review[] = [];

      snapshot.forEach((doc) => {
        reviews.push({
          id: doc.id,
          ...doc.data(),
        } as Review);
      });

      return reviews;
    } catch (error) {
      logger.error('[Ratings] Error getting client rating history:', error);
      return [];
    }
  },

  async getTopRatedGuards(limitCount: number = 10): Promise<any[]> {
    try {
      const guardsQuery = query(
        collection(getDbInstance(), 'users'),
        where('role', '==', 'guard'),
        where('kycStatus', '==', 'approved'),
        orderBy('rating', 'desc'),
        limit(limitCount)
      );

      const snapshot = await getDocs(guardsQuery);
      const guards: any[] = [];

      snapshot.forEach((doc) => {
        guards.push({
          id: doc.id,
          ...doc.data(),
        });
      });

      return guards;
    } catch (error) {
      logger.error('[Ratings] Error getting top rated guards:', error);
      return [];
    }
  },

  calculateAverageRating(ratings: number[]): number {
    if (ratings.length === 0) return 0;
    const sum = ratings.reduce((acc, rating) => acc + rating, 0);
    return sum / ratings.length;
  },

  getRatingLabel(rating: number): string {
    if (rating >= 4.5) return i18n.t('booking:ratingLabel.excellent');
    if (rating >= 4.0) return i18n.t('booking:ratingLabel.veryGood');
    if (rating >= 3.5) return i18n.t('booking:ratingLabel.good');
    if (rating >= 3.0) return i18n.t('booking:ratingLabel.average');
    if (rating >= 2.0) return i18n.t('booking:ratingLabel.belowAverage');
    return i18n.t('booking:ratingLabel.poor');
  },

  getRatingColor(rating: number): string {
    if (rating >= 4.5) return '#10B981';
    if (rating >= 4.0) return '#34D399';
    if (rating >= 3.5) return '#FBBF24';
    if (rating >= 3.0) return '#F59E0B';
    if (rating >= 2.0) return '#F97316';
    return '#EF4444';
  },

  validateRating(rating: number): boolean {
    return rating >= 1 && rating <= 5 && Number.isInteger(rating);
  },

  validateRatingBreakdown(breakdown: RatingBreakdown): boolean {
    const values = Object.values(breakdown);
    return values.every((val) => val >= 1 && val <= 5 && Number.isInteger(val));
  },
};
