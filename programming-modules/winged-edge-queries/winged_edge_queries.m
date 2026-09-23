function [edgeIds, vertexIds] = winged_edge_queries(csvFile, queryType, queryId)
% Query the numeric winged-edge CSV from the CAD Solid Modeling page.
% Examples:
%   winged_edge_queries('cube-winged-edges.csv', 'vertex', 0)
%   winged_edge_queries('cube-winged-edges.csv', 'face', 1)
% Output vertexIds means neighbors for a vertex query, boundary vertices
% for a face query. No toolboxes are required.

    data = readmatrix(csvFile, 'NumHeaderLines', 1);
    if isempty(data) || size(data, 2) ~= 9 || ...
            any(~isfinite(data(:))) || any(data(:) < 0 | data(:) ~= floor(data(:)))
        error('Expected the nine-column numeric winged-edge CSV.');
    end
    if ~isscalar(queryId) || queryId < 0 || queryId ~= floor(queryId)
        error('The query ID must be a non-negative integer.');
    end

    edgeRows = containers.Map('KeyType', 'double', 'ValueType', 'double');
    vertexSeed = containers.Map('KeyType', 'double', 'ValueType', 'double');
    faceSeed = containers.Map('KeyType', 'double', 'ValueType', 'double');
    for rowNumber = 1:size(data, 1)
        row = data(rowNumber, :);
        edgeId = row(1);
        if isKey(edgeRows, edgeId) || row(2) == row(3) || row(4) == row(5)
            error('Duplicate or invalid edge %d.', edgeId);
        end
        edgeRows(edgeId) = rowNumber;
        for vertex = row(2:3)
            if ~isKey(vertexSeed, vertex), vertexSeed(vertex) = edgeId; end
        end
        for face = row(4:5)
            if ~isKey(faceSeed, face), faceSeed(face) = edgeId; end
        end
    end
    for rowNumber = 1:size(data, 1)
        for pointer = data(rowNumber, 6:9)
            if ~isKey(edgeRows, pointer)
                error('Edge %d points to a missing edge.', data(rowNumber, 1));
            end
        end
    end

    kind = lower(string(queryType));
    if kind == "vertex"
        if ~isKey(vertexSeed, queryId), error('Vertex %d is absent.', queryId); end
        start = vertexSeed(queryId);
    elseif kind == "face"
        if ~isKey(faceSeed, queryId), error('Face %d is absent.', queryId); end
        start = faceSeed(queryId);
    else
        error('queryType must be ''vertex'' or ''face''.');
    end

    current = start;
    seen = containers.Map('KeyType', 'double', 'ValueType', 'logical');
    edgeIds = [];
    vertexIds = [];
    while ~isKey(seen, current)
        if ~isKey(edgeRows, current), error('Broken wing pointer.'); end
        row = data(edgeRows(current), :);
        seen(current) = true;
        edgeIds(end + 1) = current; %#ok<AGROW>
        if kind == "vertex"
            if row(2) == queryId
                vertexIds(end + 1) = row(3); %#ok<AGROW>
                current = row(6); % left previous
            elseif row(3) == queryId
                vertexIds(end + 1) = row(2); %#ok<AGROW>
                current = row(8); % right previous
            else
                error('Broken vertex ring.');
            end
        else
            if row(4) == queryId
                vertexIds(end + 1) = row(2); %#ok<AGROW>
                current = row(7); % left next
            elseif row(5) == queryId
                vertexIds(end + 1) = row(3); %#ok<AGROW>
                current = row(9); % right next
            else
                error('Broken face loop.');
            end
        end
    end
    if current ~= start, error('The traversal entered a different cycle.'); end
    fprintf('Edges: %s\nVertices: %s\n', mat2str(edgeIds), mat2str(vertexIds));
end
