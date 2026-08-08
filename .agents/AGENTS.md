# AutoWashPro Agent Rules

## API Pagination & Local Filtering
When fetching list data from the API (like `getMyBookings`) that is intended to be filtered locally (client-side) by date or status, ALWAYS ensure one of the following:
1. Pass the filter parameters directly to the API (e.g. `dateFrom`, `dateTo`, `status`) so the backend does the filtering before pagination.
2. If local filtering is strictly required, pass a high `limit` (e.g. `limit: 100`) to the API call.

Failing to do this will cause bugs where older matching items are omitted because they fall past the first page of results (the default API limit is usually 10-20).

## Checking Totals
When you only need the total count of items (like on a Profile screen), pass `limit: 1` and check the API's pagination metadata (`response.pagination?.total`) rather than downloading all items to check array length.

## Time & Schedule Validation (Client-Side)
When handling dates and times on the client side (especially for booking, scheduling, or rendering time slots), ALWAYS verify if a slot has already passed relative to the user's current local time. 
Do not blindly trust the backend's `available: true` flags for times in the current day, as they may only check for capacity and not chronological validity. Any time slot in the past should be manually marked as disabled/unavailable on the frontend.
