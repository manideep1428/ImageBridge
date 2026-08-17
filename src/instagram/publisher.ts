export interface InstagramPublishOptions {
  accessToken?: string;
  userId?: string;
  imageUrls: string[];
  caption?: string;
}

export interface InstagramPublishResult {
  success: boolean;
  mediaId: string;
  postType: 'single' | 'carousel';
  containerId: string;
}

export class InstagramPublisher {
  private apiVersion = 'v21.0';
  private baseUrl = `https://graph.instagram.com/${this.apiVersion}`;

  async publish(options: InstagramPublishOptions): Promise<InstagramPublishResult> {
    const token = (options.accessToken || process.env.INSTAGRAM_ACCESS_TOKEN || '').trim();
    if (!token) {
      throw new Error('Instagram Access Token is required. Set INSTAGRAM_ACCESS_TOKEN in .env or pass in options.');
    }

    if (!options.imageUrls || options.imageUrls.length === 0) {
      throw new Error('At least one public image URL is required to publish.');
    }

    // Step 0: Resolve User ID if needed
    let userId = options.userId || process.env.INSTAGRAM_USER_ID;
    if (!userId) {
      const meRes = await fetch(`${this.baseUrl}/me?access_token=${encodeURIComponent(token)}&fields=id`);
      const meData = (await meRes.json()) as { id?: string; error?: { message?: string } };
      if (meRes.ok && meData.id) {
        userId = meData.id;
      } else {
        throw new Error(meData.error?.message || 'Could not resolve Instagram User ID.');
      }
    }

    const resolvedUserId: string = userId;
    const caption = options.caption || 'Virtual Try-On Lookbook ✨ #Fashion #AI #OOTD';

    // Single Image Flow
    if (options.imageUrls.length === 1 && options.imageUrls[0]) {
      return await this.publishSingleImage(resolvedUserId, token, options.imageUrls[0], caption);
    }

    // Carousel Flow (2 to 10 images)
    return await this.publishCarousel(resolvedUserId, token, options.imageUrls.slice(0, 10), caption);
  }

  private async publishSingleImage(
    userId: string,
    token: string,
    imageUrl: string,
    caption: string
  ): Promise<InstagramPublishResult> {
    console.log(`[InstagramPublisher] Creating Single Image container for user ${userId}...`);

    const containerRes = await fetch(`${this.baseUrl}/${userId}/media`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        access_token: token,
        image_url: imageUrl,
        caption,
        is_ai_generated: true,
      }),
    });

    const containerData = (await containerRes.json()) as { id?: string; error?: { message?: string } };
    if (!containerRes.ok || !containerData.id) {
      throw new Error(containerData.error?.message || 'Failed to create Instagram image container.');
    }

    const containerId = containerData.id;
    await this.waitForContainerReady(containerId, token);

    const mediaId = await this.publishContainer(userId, token, containerId);
    console.log(`[InstagramPublisher] Single Image Post published! Media ID: ${mediaId}`);

    return {
      success: true,
      mediaId,
      postType: 'single',
      containerId,
    };
  }

  private async publishCarousel(
    userId: string,
    token: string,
    imageUrls: string[],
    caption: string
  ): Promise<InstagramPublishResult> {
    console.log(`[InstagramPublisher] Creating Carousel (${imageUrls.length} items) for user ${userId}...`);

    // 1. Create Child Item Containers
    const childContainerIds: string[] = [];
    for (let i = 0; i < imageUrls.length; i++) {
      const imgUrl = imageUrls[i];
      if (!imgUrl) continue;
      console.log(`[InstagramPublisher] Creating carousel child container ${i + 1}/${imageUrls.length}...`);

      const childRes = await fetch(`${this.baseUrl}/${userId}/media`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          access_token: token,
          image_url: imgUrl,
          is_carousel_item: true,
        }),
      });

      const childData = (await childRes.json()) as { id?: string; error?: { message?: string } };
      if (!childRes.ok || !childData.id) {
        throw new Error(childData.error?.message || `Failed to create carousel child item ${i + 1}.`);
      }
      childContainerIds.push(childData.id);
    }

    // 2. Wait for all child containers to be ready
    for (const childId of childContainerIds) {
      await this.waitForContainerReady(childId, token);
    }

    // 3. Create Carousel Parent Container
    console.log(`[InstagramPublisher] Creating Carousel parent container...`);
    const carouselRes = await fetch(`${this.baseUrl}/${userId}/media`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        access_token: token,
        media_type: 'CAROUSEL',
        children: childContainerIds.join(','),
        caption,
        is_ai_generated: true,
      }),
    });

    const carouselData = (await carouselRes.json()) as { id?: string; error?: { message?: string } };
    if (!carouselRes.ok || !carouselData.id) {
      throw new Error(carouselData.error?.message || 'Failed to create Instagram Carousel container.');
    }

    const carouselContainerId = carouselData.id;
    await this.waitForContainerReady(carouselContainerId, token);

    // 4. Publish Carousel
    const mediaId = await this.publishContainer(userId, token, carouselContainerId);
    console.log(`[InstagramPublisher] Carousel Post published! Media ID: ${mediaId}`);

    return {
      success: true,
      mediaId,
      postType: 'carousel',
      containerId: carouselContainerId,
    };
  }

  private async waitForContainerReady(containerId: string, token: string): Promise<void> {
    for (let attempt = 0; attempt < 15; attempt++) {
      await new Promise((r) => setTimeout(r, 2000));
      const res = await fetch(
        `${this.baseUrl}/${containerId}?access_token=${encodeURIComponent(token)}&fields=status_code`
      );
      const data = (await res.json()) as { status_code?: string; error_message?: string };
      if (res.ok) {
        if (!data.status_code || data.status_code === 'FINISHED' || data.status_code === 'READY') {
          return;
        }
        if (data.status_code === 'ERROR') {
          throw new Error(`Container ${containerId} processing failed on Meta servers: ${data.error_message || 'Error'}`);
        }
      }
    }
  }

  private async publishContainer(userId: string, token: string, creationId: string): Promise<string> {
    const url = `${this.baseUrl}/${userId}/media_publish?creation_id=${encodeURIComponent(creationId)}&access_token=${encodeURIComponent(token)}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        access_token: token,
        creation_id: creationId,
      }),
    });

    const data = (await res.json()) as { id?: string; error?: { message?: string } };
    if (!res.ok || !data.id) {
      throw new Error(data.error?.message || 'Failed to publish media container.');
    }
    return data.id;
  }
}
