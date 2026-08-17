import fs from 'node:fs';
import path from 'node:path';
import { InstagramPublisher, type InstagramPublishResult } from '../instagram/publisher.js';

export interface PendingApproval {
  id: string;
  jobId: string;
  outfitUrl: string;
  generatedImages: string[];
  caption: string;
  status: 'PENDING' | 'PUBLISHED' | 'REJECTED';
  createdAt: string;
  publishedAt?: string;
  instagramResult?: InstagramPublishResult | null;
}

export class ApprovalManager {
  private approvalsFile: string;
  private approvals: Map<string, PendingApproval> = new Map();
  private igPublisher: InstagramPublisher;

  constructor(storageDir?: string) {
    const dir = storageDir || path.resolve(process.cwd(), './tmp');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    this.approvalsFile = path.join(dir, 'pending_approvals.json');
    this.igPublisher = new InstagramPublisher();
    this.loadFromFile();
  }

  private loadFromFile(): void {
    try {
      if (fs.existsSync(this.approvalsFile)) {
        const raw = fs.readFileSync(this.approvalsFile, 'utf-8');
        const data = JSON.parse(raw) as PendingApproval[];
        data.forEach((item) => this.approvals.set(item.id, item));
        console.log(`[ApprovalManager] Loaded ${this.approvals.size} approval record(s) from storage.`);
      }
    } catch (err) {
      console.warn('[ApprovalManager] Could not load pending approvals from storage:', err);
    }
  }

  private saveToFile(): void {
    try {
      const array = Array.from(this.approvals.values());
      fs.writeFileSync(this.approvalsFile, JSON.stringify(array, null, 2));
    } catch (err) {
      console.error('[ApprovalManager] Error saving pending approvals:', err);
    }
  }

  /**
   * Creates a new pending approval record before posting to Instagram.
   */
  createPendingApproval(options: {
    jobId: string;
    outfitUrl: string;
    generatedImages: string[];
    caption: string;
  }): PendingApproval {
    const id = `appr_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const approval: PendingApproval = {
      id,
      jobId: options.jobId,
      outfitUrl: options.outfitUrl,
      generatedImages: options.generatedImages,
      caption: options.caption,
      status: 'PENDING',
      createdAt: new Date().toISOString(),
    };

    this.approvals.set(id, approval);
    this.saveToFile();

    console.log(`\n================================================================`);
    console.log(`🔔 [APPROVAL NOTIFICATION] New Try-On Ready for Approval!`);
    console.log(`================================================================`);
    console.log(`  Approval ID:     ${approval.id}`);
    console.log(`  Job ID:          ${approval.jobId}`);
    console.log(`  Outfits count:   ${approval.generatedImages.length}`);
    console.log(`  Default Caption: "${approval.caption}"`);
    console.log(`  App Status:      AWAITING_APPROVAL (Pending mobile approval)`);
    console.log(`================================================================\n`);

    return approval;
  }

  /**
   * Returns all pending approvals.
   */
  getPendingApprovals(): PendingApproval[] {
    return Array.from(this.approvals.values()).filter((item) => item.status === 'PENDING');
  }

  /**
   * Returns all approval records.
   */
  getAllApprovals(): PendingApproval[] {
    return Array.from(this.approvals.values());
  }

  /**
   * Gets a specific approval record by ID.
   */
  getApproval(id: string): PendingApproval | undefined {
    return this.approvals.get(id);
  }

  /**
   * Approves a pending job, allowing caption editing before publishing to Instagram.
   */
  async approveAndPublish(id: string, newCaption?: string): Promise<PendingApproval> {
    const approval = this.approvals.get(id);
    if (!approval) {
      throw new Error(`Approval record with ID "${id}" not found.`);
    }

    if (approval.status !== 'PENDING') {
      throw new Error(`Approval record "${id}" has already been processed (Status: ${approval.status}).`);
    }

    const finalCaption = newCaption !== undefined ? newCaption : approval.caption;
    console.log(`[ApprovalManager] Approving post ${id}... Final Caption: "${finalCaption}"`);

    // Publish to Instagram
    const igResult = await this.igPublisher.publish({
      imageUrls: approval.generatedImages,
      caption: finalCaption,
    });

    approval.caption = finalCaption;
    approval.status = 'PUBLISHED';
    approval.publishedAt = new Date().toISOString();
    approval.instagramResult = igResult;

    this.saveToFile();

    console.log(`[ApprovalManager] Successfully published approval ${id} to Instagram! Media ID: ${igResult.mediaId}`);
    return approval;
  }

  /**
   * Rejects/cancels a pending post.
   */
  rejectApproval(id: string): PendingApproval {
    const approval = this.approvals.get(id);
    if (!approval) {
      throw new Error(`Approval record with ID "${id}" not found.`);
    }

    if (approval.status !== 'PENDING') {
      throw new Error(`Approval record "${id}" is not pending (Status: ${approval.status}).`);
    }

    approval.status = 'REJECTED';
    this.saveToFile();

    console.log(`[ApprovalManager] Rejected approval ${id}. Post cancelled.`);
    return approval;
  }
}
