# Optional setup: use the same source-to-destination permutations as Stage 4.
mixing_moves = [np.arange(N)]
for mixing_face in FACE_NAMES:
    mixing_moves.extend([PERMS[mixing_face], np.argsort(PERMS[mixing_face])])
assert len(mixing_moves) == len(MOVE_OPTIONS)

def mixing_orbit(start):
    reached, queue = {tuple(start)}, [tuple(start)]
    for source in queue:
        for permutation in mixing_moves:
            destination = tuple(int(permutation[position]) for position in source)
            if destination not in reached:
                reached.add(destination)
                queue.append(destination)
    return reached

corner_positions = np.array(sorted(position[0] for position in mixing_orbit((0,))))
corner_index = {int(position): index for index, position in enumerate(corner_positions)}
corner_T = T[np.ix_(corner_positions, corner_positions)]
corner_target = np.full(len(corner_positions), 1.0 / len(corner_positions))
assert len(corner_positions) == 24
assert np.allclose(corner_T.sum(axis=0), 1)
assert np.allclose(corner_T.sum(axis=1), 1)
assert np.allclose(corner_T @ corner_target, corner_target)

# The Stage 1 frames identify physical cubie slots, not sticker labels.
mixing_frames = np.array([
    [[0, 1, 0], [1, 0, 0], [0, 0, -1]],
    [[0, -1, 0], [1, 0, 0], [0, 0, 1]],
    [[0, 0, 1], [1, 0, 0], [0, 1, 0]],
    [[0, 0, -1], [-1, 0, 0], [0, 1, 0]],
    [[-1, 0, 0], [0, 0, 1], [0, 1, 0]],
    [[1, 0, 0], [0, 0, -1], [0, 1, 0]],
])
corner_slots = {}
for position in corner_positions:
    face, local = divmod(int(position), 9)
    normal, right, up = mixing_frames[face]
    row, column = divmod(local, 3)
    corner_slots[int(position)] = tuple(normal + (column - 1) * right + (1 - row) * up)
assert all(all(abs(coordinate) == 1 for coordinate in slot) for slot in corner_slots.values())
slot_groups = {}
for position, slot in corner_slots.items():
    slot_groups.setdefault(slot, []).append(position)
assert len(slot_groups) == 8 and all(len(group) == 3 for group in slot_groups.values())
for permutation in mixing_moves:
    assert all(len({corner_slots[int(permutation[position])] for position in group}) == 1
               for group in slot_groups.values())

# Breadth-first search applies ONE common move to the ordered pair.
joint_reachable = mixing_orbit((0, 2))
joint_mask = np.zeros((len(corner_positions), len(corner_positions)), dtype=bool)
for first, second in joint_reachable:
    joint_mask[corner_index[second], corner_index[first]] = True
same_slot = np.array([[corner_slots[int(first)] == corner_slots[int(second)]
                      for first in corner_positions] for second in corner_positions])
assert np.array_equal(joint_mask, ~same_slot)
assert len(joint_reachable) == int(joint_mask.sum()) == 504
assert int(same_slot.sum()) == 72
joint_target = 1.0 / len(joint_reachable)

# Each generator permutes the reachable pairs; equal incoming counts certify
# a stationary uniform target without allocating a 504-by-504 matrix.
joint_pairs = sorted(joint_reachable)
joint_index = {pair: index for index, pair in enumerate(joint_pairs)}
joint_destinations = np.array([[joint_index[(int(permutation[first]), int(permutation[second]))]
                              for first, second in joint_pairs] for permutation in mixing_moves])
assert np.all(np.bincount(joint_destinations.ravel(), minlength=len(joint_pairs)) == len(mixing_moves))

def mixing_wrap(text, width=20):
    lines, line = [], ""
    for word in str(text).split():
        if line and len(line) + 1 + len(word) > width:
            lines.append(line)
            line = word
        else:
            line = (line + " " + word).strip()
    return "<br>".join(lines + [line])

mixing_checkpoints = (100, 1000, 10000)
mixing_seed = 20261007
mixing_ticks = corner_positions[::4].tolist() + [int(corner_positions[-1])]
mixing_index_ticks = list(range(1, len(corner_positions) + 1, 4)) + [len(corner_positions)]
print("Corner positions:", corner_positions.tolist())
print("Reachable ordered pairs:", len(joint_reachable))
print("Masked same-cubie pairs:", int(same_slot.sum()))
