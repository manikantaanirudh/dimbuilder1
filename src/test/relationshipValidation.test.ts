import { describe, expect, it, vi } from "vitest";
import { createDimensionsRouter } from "../server/routes/dimensions";
import type { Repositories } from "../server/db/repositories";
import type { AppConfig } from "../shared/appConfigTypes";

describe("Relationship member validation", () => {
  it("validates parent and child keys directly", async () => {
    const mockDimension = {
      id: "dim-123",
      projectId: "proj-456",
      dimensionType: "Entity",
      dimensionName: "EntityDim",
      metadata: { relationshipDefaults: {} }
    };

    const mockMembers = [
      { id: "m1", memberKey: "LE_100", dimensionId: "dim-123" },
      { id: "m2", memberKey: "LE_200", dimensionId: "dim-123" },
    ];

    const mockRepos = {
      dimensions: {
        get: vi.fn().mockResolvedValue(mockDimension),
      },
      members: {
        listAllByDimension: vi.fn().mockResolvedValue(mockMembers),
      },
      relationships: {
        shiftOrders: vi.fn().mockResolvedValue(undefined),
        create: vi.fn().mockImplementation((input) => Promise.resolve({ id: "rel-1", ...input })),
      },
      audit: {
        record: vi.fn().mockResolvedValue(undefined),
      },
    } as unknown as Repositories;

    const mockConfig = {
      validation: {
        oneStreamProfile: { enabled: true },
      },
      dimensions: {
        blueprints: {
          defaults: {
            relationship: {
              aggregationWeight: 1,
              percentConsol: 100,
              percentOwnership: 100,
              ownershipType: "Standard",
            }
          }
        }
      }
    } as unknown as AppConfig;

    const router = createDimensionsRouter({ repos: mockRepos, config: mockConfig });
    
    // Find the post handler for /dimensions/:dimensionId/relationships
    const postRoute = router.stack.find(
      (layer) => layer.route && layer.route.path === "/dimensions/:dimensionId/relationships" && layer.route.methods.post
    );
    expect(postRoute).toBeDefined();
    const handler = postRoute!.route!.stack[0].handle;

    // Test 1: Valid parent/child key
    const req1 = {
      params: { dimensionId: "dim-123", projectId: "proj-456" },
      body: { parentKey: "LE_100", childKey: "LE_200", properties: {} },
    };
    const res1 = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };
    await handler(req1 as any, res1 as any, vi.fn() as any);
    expect(res1.status).toHaveBeenCalledWith(201);

    // Test 2: Invalid parent key (should fail with 400)
    const req2 = {
      params: { dimensionId: "dim-123", projectId: "proj-456" },
      body: { parentKey: "INVALID_KEY", childKey: "LE_200", properties: {} },
    };
    const res2 = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };
    await handler(req2 as any, res2 as any, vi.fn() as any);
    expect(res2.status).toHaveBeenCalledWith(400);
    expect(res2.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.stringContaining("Parent member 'INVALID_KEY' does not exist"),
      })
    );
  });
});
