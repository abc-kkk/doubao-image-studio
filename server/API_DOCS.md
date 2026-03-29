# Gemini Relay Unified API Documentation

Base URL: `http://115.190.228.12:8080`
Endpoint: `/api/unified`
Method: `POST`
Content-Type: `application/json`

## 1. Text Chat (文本对话)

Supported Models:
- `g2`: Gemini 2.0 Flash
- `g2.5`: Gemini 2.5 Flash
- `g3`: Gemini 3.0 Pro Preview
- `db`: Doubao Pro (Web)

**Request Body:**
```json
{
    "mode": "chat",
    "model": "db",
    "prompt": "Hello, who are you?"
}
```

**Curl Example (Doubao):**
```bash
curl -X POST http://115.190.228.12:8080/api/unified \
  -H "Content-Type: application/json" \
  -d '{
    "mode": "chat",
    "model": "db",
    "prompt": "你好，请介绍一下你自己"
  }'
```

**Curl Example (Gemini 2.5):**
```bash
curl -X POST http://115.190.228.12:8080/api/unified \
  -H "Content-Type: application/json" \
  -d '{
    "mode": "chat",
    "model": "g2.5",
    "prompt": "Explain quantum physics in simple terms"
  }'
```

---

## 2. Image Generation (文生图)

Supported Models:
- `g2.5`: Gemini 2.5 Flash Image
- `db`: Doubao Pro Image (Web)

**Request Body:**
```json
{
    "mode": "image_generation",
    "model": "db",
    "prompt": "A cute cyberpunk cat",
    "reference_images": ["BASE64_IMAGE_1", "BASE64_IMAGE_2"],
    "aspect_ratio": "16:9"
}
```

**Parameters:**
- `mode` (required): Must be "image_generation"
- `model` (required): "db" for Doubao or "g2.5" for Gemini
- `prompt` (required): Text description of the image to generate
- `reference_images` (optional): Array of base64-encoded reference images (with or without data URI prefix)
- `aspect_ratio` (optional): Image aspect ratio. Supported values:
  - `"Auto"` (default)
  - `"1:1"` - Square
  - `"2:3"` - Portrait
  - `"4:3"` - Standard
  - `"9:16"` - Vertical
  - `"16:9"` - Widescreen

**Curl Example (Doubao Image - Basic):**
```bash
curl -X POST http://115.190.228.12:8080/api/unified \
  -H "Content-Type: application/json" \
  -d '{
    "mode": "image_generation",
    "model": "db",
    "prompt": "一只赛博朋克风格的可爱小猫"
  }'
```

**Curl Example (Doubao Image - With Reference Images and Aspect Ratio):**
```bash
curl -X POST http://115.190.228.12:8080/api/unified \
  -H "Content-Type: application/json" \
  -d '{
    "mode": "image_generation",
    "model": "db",
    "prompt": "一只赛博朋克风格的可爱小猫，参考这些图片的风格",
    "reference_images": [
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...",
      "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQAB..."
    ],
    "aspect_ratio": "16:9"
  }'
```

---

## 3. Vision / Image Understanding (图生图/视觉理解)

Supported Models:
- `g3`: Gemini 3.0 Pro Preview

**Request Body:**
```json
{
    "mode": "vision",
    "model": "g3",
    "prompt": "Describe this image",
    "image": "BASE64_STRING_WITHOUT_PREFIX"
}
```

**Curl Example:**
*(Note: Replace `BASE64_STRING` with actual base64 image data)*

```bash
curl -X POST http://115.190.228.12:8080/api/unified \
  -H "Content-Type: application/json" \
  -d '{
    "mode": "vision",
    "model": "g3",
    "prompt": "这张图片里有什么？",
    "image": "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
  }'
```
