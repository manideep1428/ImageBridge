import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export interface ExtractedOutfit {
  title?: string;
  imageUrls: string[];
  localImagePaths: string[];
}

export class UrlOutfitExtractor {
  private tmpDir: string;

  constructor(tmpDir?: string) {
    this.tmpDir = tmpDir || path.resolve(process.cwd(), './tmp/outfits');
    if (!fs.existsSync(this.tmpDir)) {
      fs.mkdirSync(this.tmpDir, { recursive: true });
    }
  }

  /**
   * Scrapes or downloads outfit imagery from direct image URLs, Instagram posts/carousels, local directories (e.g. ./tmp/outfits), or eCommerce web pages.
   */
  async extractFromUrl(url?: string, maxImages: number = 4): Promise<ExtractedOutfit> {
    const target = url || this.tmpDir;
    console.log(`[UrlOutfitExtractor] Resolving outfit images from: ${target}`);

    // Check if target is a local file or directory
    const resolvedPath = path.resolve(process.cwd(), target);
    if (fs.existsSync(resolvedPath)) {
      const stat = fs.statSync(resolvedPath);
      if (stat.isDirectory()) {
        const files = fs
          .readdirSync(resolvedPath)
          .filter((f) => /\.(jpg|jpeg|png|webp|avif)$/i.test(f))
          .map((f) => path.join(resolvedPath, f))
          .slice(0, maxImages);

        if (files.length === 0) {
          throw new Error(`No local image files (.jpg, .png, .webp) found in directory: ${resolvedPath}`);
        }

        console.log(`[UrlOutfitExtractor] Loaded ${files.length} local outfit image(s) from directory: ${resolvedPath}`);
        return {
          title: 'Local Outfit Directory',
          imageUrls: files,
          localImagePaths: files,
        };
      } else if (stat.isFile()) {
        console.log(`[UrlOutfitExtractor] Loaded 1 local outfit image file: ${resolvedPath}`);
        return {
          title: 'Local Outfit Image File',
          imageUrls: [resolvedPath],
          localImagePaths: [resolvedPath],
        };
      }
    }

    // 1. Direct Image URL file extension check
    if (/\.(jpg|jpeg|png|webp|avif)($|\?)/i.test(target)) {
      const localPath = await this.downloadImage(target);
      return {
        title: 'Direct Outfit Image',
        imageUrls: [target],
        localImagePaths: [localPath],
      };
    }

    // 2. Instagram Post / Carousel handling
    if (target.includes('instagram.com/p/') || target.includes('instagram.com/reel/')) {
      return await this.extractFromInstagram(target, maxImages);
    }

    // 3. Generic Webpage / E-commerce product page scraping
    let imageUrls: string[] = [];
    let title: string | undefined;

    try {
      const res = await fetch(target, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
        },
      });

      if (res.ok) {
        const contentType = res.headers.get('content-type') || '';

        // If the URL directly returns an image MIME type
        if (contentType.startsWith('image/')) {
          const buffer = Buffer.from(await res.arrayBuffer());
          const ext = contentType.includes('png')
            ? '.png'
            : contentType.includes('webp')
            ? '.webp'
            : '.jpg';
          const hash = crypto.createHash('md5').update(target).digest('hex').substring(0, 10);
          const filePath = path.join(this.tmpDir, `outfit_${hash}${ext}`);
          fs.writeFileSync(filePath, buffer);

          return {
            title: 'Direct Outfit Image',
            imageUrls: [target],
            localImagePaths: [filePath],
          };
        }

        // Otherwise parse HTML for images
        const html = await res.text();
        const ogMatches = Array.from(
          html.matchAll(/<meta\s+property=["'](?:og:image|twitter:image)["']\s+content=["']([^"']+)["']/gi)
        )
          .map((m) => m[1])
          .filter((u): u is string => typeof u === 'string' && u.length > 0);

        const imgMatches = Array.from(
          html.matchAll(/<img[^>]+src=["'](https?:\/\/[^"']+\.(?:jpg|jpeg|png|webp|avif)(?:\?[^"']*)?)["']/gi)
        )
          .map((m) => m[1])
          .filter((u): u is string => typeof u === 'string' && u.length > 0);

        const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
        if (titleMatch && titleMatch[1]) {
          title = titleMatch[1].trim();
        }

        const combined = Array.from(new Set([...ogMatches, ...imgMatches]));
        imageUrls = combined
          .filter(
            (u) =>
              !u.includes('logo') &&
              !u.includes('icon') &&
              !u.includes('avatar') &&
              !u.includes('pixel') &&
              !u.includes('badge') &&
              !u.includes('spinner')
          )
          .slice(0, maxImages);
      }
    } catch (err) {
      console.warn('[UrlOutfitExtractor] Scraping notice:', err);
    }

    const localImagePaths: string[] = [];
    for (const imgUrl of imageUrls) {
      try {
        const localPath = await this.downloadImage(imgUrl);
        localImagePaths.push(localPath);
      } catch (err) {
        console.error(`[UrlOutfitExtractor] Failed to download image ${imgUrl}:`, err);
      }
    }

    return { title, imageUrls, localImagePaths };
  }

  /**
   * Special handler for Instagram URLs with carousel and slide index support.
   */
  private async extractFromInstagram(url: string, maxImages: number = 4): Promise<ExtractedOutfit> {
    const parsedUrl = new URL(url);
    const imgIndexParam = parsedUrl.searchParams.get('img_index');
    const targetSlide = imgIndexParam ? parseInt(imgIndexParam, 10) : undefined;

    // Extract shortcode from /p/{shortcode}/ or /reel/{shortcode}/
    const match = url.match(/instagram\.com\/(?:p|reel)\/([A-Za-z0-9_-]+)/);
    const shortcode = match ? match[1] : undefined;

    console.log(`[UrlOutfitExtractor] Instagram URL detected: shortcode=${shortcode || 'unknown'}, target slide=${targetSlide || 'all'}`);

    let extractedUrls: string[] = [];

    // Attempt 1: Social Crawler Fetch (Facebook / Twitter bot User-Agent)
    if (shortcode) {
      try {
        console.log(`[UrlOutfitExtractor] Scraping Instagram post ${shortcode} via social crawler fetch...`);
        const postUrl = `https://www.instagram.com/p/${shortcode}/`;
        const res = await fetch(postUrl, {
          headers: {
            'User-Agent': 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
          },
        });

        if (res.ok) {
          const html = await res.text();
          const unescaped = html.replace(/&amp;/gi, '&').replace(/\\u0026/gi, '&').replace(/\\\//gi, '/');

          const ogMatches = Array.from(
            unescaped.matchAll(/<meta\s+(?:property|name)=["'](?:og:image|twitter:image)["']\s+content=["']([^"']+)["']/gi)
          )
            .map((m) => m[1])
            .filter((u): u is string => typeof u === 'string' && u.startsWith('http') && !u.includes('logo') && !u.includes('icon'));

          if (ogMatches.length > 0) {
            extractedUrls = Array.from(new Set(ogMatches));
            console.log(`[UrlOutfitExtractor] Extracted ${extractedUrls.length} image(s) via social crawler fetch.`);
          }
        }
      } catch (err) {
        console.warn('[UrlOutfitExtractor] Social crawler attempt notice:', err);
      }
    }

    // Attempt 2: Instagram Web API (__a=1&__d=dis)
    if (extractedUrls.length === 0 && shortcode) {
      try {
        const apiUrl = `https://www.instagram.com/p/${shortcode}/?__a=1&__d=dis`;
        const res = await fetch(apiUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
            'X-IG-App-ID': '936619743392459',
            'Accept': 'application/json',
          },
        });

        if (res.ok) {
          const data = await res.json();
          if (data.graphql?.shortcode_media) {
            const media = data.graphql.shortcode_media;
            if (media.edge_sidecar_to_children?.edges?.length > 0) {
              const edges = media.edge_sidecar_to_children.edges;
              extractedUrls = edges.map((e: any) => e.node.display_url).filter(Boolean);
            } else if (media.display_url) {
              extractedUrls.push(media.display_url);
            }
          } else if (data.items?.[0]) {
            const item = data.items[0];
            if (item.carousel_media?.length > 0) {
              extractedUrls = item.carousel_media
                .map((m: any) => m.image_versions2?.candidates?.[0]?.url)
                .filter(Boolean);
            } else if (item.image_versions2?.candidates?.[0]?.url) {
              extractedUrls.push(item.image_versions2.candidates[0].url);
            }
          }
        }
      } catch (err) {
        console.warn('[UrlOutfitExtractor] Instagram API attempt notice:', err);
      }
    }

    // Attempt 3: Embed page JSON / Meta parsing
    if (extractedUrls.length === 0 && shortcode) {
      try {
        const embedUrl = `https://www.instagram.com/p/${shortcode}/embed/captioned/`;
        const res = await fetch(embedUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
          },
        });
        if (res.ok) {
          const html = await res.text();
          const unescaped = html.replace(/&amp;/gi, '&').replace(/\\u0026/gi, '&').replace(/\\\//gi, '/');
          const matches = Array.from(unescaped.matchAll(/(https:\/\/[^"'\s<>]+\.(?:jpg|jpeg|png|webp)[^"'\s<>]*)/gi))
            .map((m) => m[1])
            .filter((u): u is string => typeof u === 'string' && !u.includes('rsrc.php') && !u.includes('150x150') && !u.includes('static') && !u.includes('emoji'));

          if (matches.length > 0) {
            extractedUrls = Array.from(new Set(matches));
          }
        }
      } catch (err) {
        console.warn('[UrlOutfitExtractor] Instagram embed scraping notice:', err);
      }
    }

    // Target slide selection or carousel slicing
    if (targetSlide && extractedUrls.length >= targetSlide) {
      extractedUrls = [extractedUrls[targetSlide - 1]!];
    } else if (extractedUrls.length > maxImages) {
      extractedUrls = extractedUrls.slice(0, maxImages);
    }

    if (extractedUrls.length === 0) {
      throw new Error(`Failed to extract outfit images from Instagram post: ${url}. Verify the post is public.`);
    }

    console.log(`[UrlOutfitExtractor] Successfully resolved ${extractedUrls.length} Instagram image URL(s). Downloading...`);

    const localImagePaths: string[] = [];
    for (const imgUrl of extractedUrls) {
      try {
        const localPath = await this.downloadImage(imgUrl);
        localImagePaths.push(localPath);
      } catch (err) {
        console.error(`[UrlOutfitExtractor] Failed downloading Instagram image ${imgUrl}:`, err);
      }
    }

    if (localImagePaths.length === 0) {
      throw new Error(`Could not download extracted Instagram images from: ${url}`);
    }

    return {
      title: `Instagram Look ${shortcode ? `(${shortcode})` : ''} ${targetSlide ? `[Slide ${targetSlide}]` : ''}`.trim(),
      imageUrls: extractedUrls,
      localImagePaths,
    };
  }

  private async downloadImage(imageUrl: string): Promise<string> {
    const hash = crypto.createHash('md5').update(imageUrl).digest('hex').substring(0, 10);
    const ext = path.extname(new URL(imageUrl).pathname) || '.jpg';
    const filePath = path.join(this.tmpDir, `outfit_${hash}${ext}`);

    if (fs.existsSync(filePath)) return filePath;

    const res = await fetch(imageUrl);
    if (!res.ok) throw new Error(`HTTP ${res.status} downloading image from ${imageUrl}`);
    const buffer = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(filePath, buffer);
    return filePath;
  }
}
