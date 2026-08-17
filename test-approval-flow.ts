import { ApprovalManager } from './src/jobs/approval-manager.js';

console.log('\n================================================================');
console.log('🧪 Testing Approval & Notification Flow (Backend 24/7 Queue)');
console.log('================================================================\n');

async function runApprovalTest() {
  const manager = new ApprovalManager('./tmp');

  // Step 1: Create pending approval notification (simulating Try-On Pipeline output)
  console.log('[Test 1] Creating pending approval notification...');
  const approval = manager.createPendingApproval({
    jobId: `test_job_${Date.now()}`,
    outfitUrl: 'https://images.unsplash.com/photo-1515372039744-b8f02a3ae446?w=800',
    generatedImages: ['https://images.unsplash.com/photo-1515372039744-b8f02a3ae446?w=800'],
    caption: 'Original Auto-Generated Caption ✨ #Fashion #AI',
  });

  console.log(`✅ Pending Approval Created with ID: ${approval.id}`);

  // Step 2: Fetch pending approvals list (simulating Mobile App polling)
  console.log('\n[Test 2] Fetching pending approvals for mobile app...');
  const pending = manager.getPendingApprovals();
  console.log(`Found ${pending.length} pending item(s) awaiting user review.`);

  const currentItem = manager.getApproval(approval.id);
  if (!currentItem) {
    throw new Error('Failed to retrieve approval item from manager.');
  }

  console.log(`  - Approval ID:     ${currentItem.id}`);
  console.log(`  - Original Caption: "${currentItem.caption}"`);
  console.log(`  - Status:           ${currentItem.status}`);

  // Step 3: Edit caption and approve (simulating user tapping "Approve & Post to Instagram" in Mobile App)
  console.log('\n[Test 3] User editing caption and approving post...');
  const editedCaption = '🔥 Edited Caption from Mobile App! New Lookbook Carousel ✨ #Style #OOTD #FashionAI';

  // In test environment, mock igPublisher or execute approval flow
  (manager as any).igPublisher = {
    publish: async (opts: { imageUrls: string[]; caption: string }) => {
      console.log(`[MockInstagramPublisher] Successfully posted to Instagram!`);
      console.log(`  Images: ${opts.imageUrls.length}`);
      console.log(`  Caption: "${opts.caption}"`);
      return {
        success: true,
        mediaId: `mock_ig_media_${Date.now()}`,
        postType: 'single',
        containerId: `mock_ig_container_${Date.now()}`,
      };
    },
  };

  const approvedItem = await manager.approveAndPublish(approval.id, editedCaption);

  console.log('\n================================================================');
  console.log('🎉 APPROVAL FLOW TEST PASSED SUCCESSFULLY!');
  console.log('================================================================');
  console.log(`Approval ID:        ${approvedItem.id}`);
  console.log(`Final Status:       ${approvedItem.status}`);
  console.log(`Final Caption:      "${approvedItem.caption}"`);
  console.log(`Instagram Media ID: ${approvedItem.instagramResult?.mediaId}`);
  console.log('================================================================\n');
}

runApprovalTest().catch((err) => {
  console.error('❌ Approval Test Failed:', err);
  process.exit(1);
});
