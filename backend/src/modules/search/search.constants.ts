/** Maximum number of candidates fetched per entity source before merge */
export const SEARCH_CANDIDATE_LIMIT = 10;

/** Maximum number of results returned in the final response */
export const SEARCH_RESPONSE_LIMIT = 20;

// Base match scores - applied before entity boost
export const SCORE_EXACT_CODE = 120;
export const SCORE_STARTSWITH_CODE = 100;
export const SCORE_EXACT_NAME = 95;
export const SCORE_STARTSWITH_NAME = 85;
export const SCORE_CONTAINS = 60;

// Page-specific scores (static, in-memory - no DB query)
export const SCORE_PAGE_EXACT = 90;
export const SCORE_PAGE_STARTSWITH = 75;
export const SCORE_PAGE_KEYWORD = 50;

// Entity type boosts - added after base score to break cross-entity ties
export const BOOST_TRANSACTION = 10;
export const BOOST_CUSTOMER = 8;
export const BOOST_CUSTOMER_PAYMENT = 8;
export const BOOST_VENDOR_PAYMENT = 8;
export const BOOST_SUPPLIER = 7;
export const BOOST_PRODUCT = 6;
export const BOOST_JOURNAL = 4;
export const BOOST_PAGE = 0; // intentionally zero - pages remain in formula for consistency but contribute no score boost

// Applied once after baseScore resolves, when baseScore === SCORE_EXACT_CODE or SCORE_EXACT_NAME
// Only for non-page entities - ensures exact record matches decisively outrank all partial matches
export const BOOST_EXACT_MATCH = 20;

// Fuzzy fallback score - used only when ILIKE returns no results
export const SCORE_FUZZY = 40;
