# API Reference

Base URL: `http://localhost:5100`

---

## Health Check

```bash
curl -X GET "http://localhost:5100/api/health"
```

**Response:**
```json
{
  "status": "ok",
  "time": "2026-07-08T12:00:00.000Z"
}
```

---

## Get News

```bash
# All news (default limit 20, page 1)
curl -X GET "http://localhost:5100/api/news"

# With filters & pagination
curl -X GET "http://localhost:5100/api/news?category=Markets&source=moneycontrol&page=1&limit=10"
```

| Param    | Type   | Description                                    |
|----------|--------|------------------------------------------------|
| category | string | Filter by category (case-insensitive)          |
| source   | string | Filter by source name (case-insensitive, partial match) |
| page     | number | Page number (default: 1)                       |
| limit    | number | Items per page 1-50 (default: 20)              |

**Response:**
```json
{
  "success": true,
  "data": {
    "totalArticles": 15,
    "page": 1,
    "limit": 20,
    "totalPages": 1,
    "articles": [
      {
        "id": "aBcDeFgHiJkLmNoP",
        "title": "Markets rally on positive global cues",
        "description": "Indian equity markets surged today...",
        "url": "https://example.com/article",
        "publishedAt": "2026-07-08T10:30:00.000Z",
        "source": "Moneycontrol Markets",
        "category": "Markets"
      }
    ]
  }
}
```

---

## Get Paginated Feed

```bash
# Default page 1, limit 10
curl -X GET "http://localhost:5100/api/news/feed"

# Custom pagination with category filter
curl -X GET "http://localhost:5100/api/news/feed?page=2&limit=5&category=Business"
```

| Param    | Type   | Description                                    |
|----------|--------|------------------------------------------------|
| page     | number | Page number (default: 1)                       |
| limit    | number | Items per page 1-20 (default: 10)              |
| category | string | Filter by category (case-insensitive)          |

**Response:**
```json
{
  "success": true,
  "data": {
    "articles": [
      {
        "id": "aBcDeFgHiJkLmNoP",
        "title": "Business news headline",
        "description": "Summary of the article...",
        "url": "https://example.com/article",
        "publishedAt": "2026-07-08T10:30:00.000Z",
        "source": "ET Now Business",
        "category": "Business"
      }
    ],
    "pagination": {
      "currentPage": 1,
      "limit": 5,
      "totalArticles": 8,
      "hasMore": true,
      "nextPage": 2
    },
    "endMessage": null
  }
}
```

When `hasMore` is `false`, `endMessage` is:
> "You're all caught up! Fresh news arrives every 30 minutes."

---

## Get Related Articles

```bash
curl -X GET "http://localhost:5100/api/news/related?url=https%3A%2F%2Fexample.com%2Farticle&limit=5"
```

| Param | Type   | Description                                    |
|-------|--------|------------------------------------------------|
| url   | string | Article URL (URL-encoded, required)            |
| limit | number | Max related articles 1-10 (default: 5)         |

**Response:**
```json
{
  "success": true,
  "data": {
    "relatedTo": "https://example.com/article",
    "articles": [
      {
        "id": "xYzAbCdEfGhIjKlM",
        "title": "Related article title",
        "description": "Related article summary...",
        "url": "https://example.com/related",
        "publishedAt": "2026-07-08T09:00:00.000Z",
        "source": "LiveMint Money",
        "category": "Personal Finance"
      }
    ],
    "count": 1
  }
}
```

**Error (missing url):**
```json
{
  "success": false,
  "message": "Article URL is required"
}
```

---

## Refresh News Cache (Admin)

```bash
curl -X POST "http://localhost:5100/api/news/refresh" \
  -H "x-admin-secret: nidhifynewswebforlocalanduatandprodandisyour"
```

**Response:**
```json
{
  "success": true,
  "message": "News cache refreshed",
  "totalArticles": 15
}
```

**Error (wrong/missing secret):**
```json
{
  "success": false,
  "message": "Unauthorized"
}
```

---

## Error Response Format

All endpoints return this shape on failure:

```json
{
  "success": false,
  "message": "Error description"
}
```
