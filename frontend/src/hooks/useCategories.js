import { useState, useEffect, useCallback } from 'react';
import categoryService from '../services/categoryService.js';

/**
 * React hook providing the 5 canonical Dealsathi categories and their live active subcategories.
 * Initializes synchronously from cache/seed so there is zero layout shift,
 * then synchronizes with the backend API.
 */
export function useCategories() {
  const [categories, setCategories] = useState(() => categoryService.getCachedCategories());
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const unsubscribe = categoryService.subscribe((updated) => {
      if (isMounted && Array.isArray(updated)) {
        setCategories(updated);
      }
    });

    setIsLoading(true);
    categoryService
      .getPublicCategories()
      .then((list) => {
        if (isMounted && Array.isArray(list)) {
          setCategories(list);
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  const getCategoryBySlug = useCallback(
    (slug) => {
      const clean = String(slug || '').toLowerCase().trim();
      return categories.find((c) => c.slug === clean) || null;
    },
    [categories]
  );

  const refreshCategories = useCallback(async () => {
    setIsLoading(true);
    try {
      const list = await categoryService.getPublicCategories({ forceRefresh: true });
      setCategories(list);
      return list;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    categories,
    isLoading,
    getCategoryBySlug,
    refreshCategories,
  };
}

export default useCategories;
