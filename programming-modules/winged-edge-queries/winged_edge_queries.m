function [edgeIds, vertexIds] = winged_edge_queries(csvFile, queryType, queryId)
% Query the complete WEDS CSV from the CAD Solid Modeling page.
% Examples:
%   winged_edge_queries('cube-weds.csv', 'vertex', 0)
%   winged_edge_queries('cube-weds.csv', 'face', 1)
% Output vertexIds means neighbors for a vertex query, boundary vertices
% for a face query. No toolboxes are required.

    rawLines = regexp(fileread(csvFile), '\r\n|\n|\r', 'split');
    lines = rawLines(~cellfun(@isempty, strtrim(rawLines)));
    header = 'Edge,V1,V2,Left Face,Right Face,Left Previous,Left Next,Right Previous,Right Next';
    vertexTable = []; faceTable = [];
    if isempty(lines)
        error('The WEDS CSV is empty.');
    elseif strcmp(lines{1}, 'Vertex Table')
        cursor = 2;
        [vertexCount, cursor] = readCount(lines, cursor, 'Vertices');
        [vertexTable, cursor] = readTable(lines, cursor, 'Vertex,Edge Number', vertexCount, 2);
        if cursor > numel(lines) || ~strcmp(lines{cursor}, 'Face Table')
            error('Expected Face Table after the vertex records.');
        end
        cursor = cursor + 1;
        [faceCount, cursor] = readCount(lines, cursor, 'Faces');
        [faceTable, cursor] = readTable(lines, cursor, 'Face,Edge Number', faceCount, 2);
        if cursor > numel(lines) || ~strcmp(lines{cursor}, 'Edge Table')
            error('Expected Edge Table after the face records.');
        end
        cursor = cursor + 1;
        [edgeCount, cursor] = readCount(lines, cursor, 'Edges');
        [data, cursor] = readTable(lines, cursor, header, edgeCount, 9);
        if cursor <= numel(lines), error('Unexpected records after the Edge Table.'); end
    elseif strcmp(strrep(lines{1}, '"', ''), header)
        % Earlier edge-only downloads remain usable.
        [data, cursor] = readTable(lines, 1, header, numel(lines) - 1, 9);
    else
        error('Expected the WEDS CSV, not the half-edge CSV.');
    end
    if isempty(data), error('The CSV has no edge records.'); end
    if ~isscalar(queryId) || ~isfinite(queryId) || queryId < 0 || queryId ~= floor(queryId)
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
        if isempty(vertexTable)
            for vertex = row(2:3)
                if ~isKey(vertexSeed, vertex), vertexSeed(vertex) = edgeId; end
            end
            for face = row(4:5)
                if ~isKey(faceSeed, face), faceSeed(face) = edgeId; end
            end
        end
    end
    for rowNumber = 1:size(vertexTable, 1)
        vertex = vertexTable(rowNumber, 1); seed = vertexTable(rowNumber, 2);
        if isKey(vertexSeed, vertex), error('Duplicate vertex %d.', vertex); end
        if ~isKey(edgeRows, seed), error('Vertex %d has a missing seed edge.', vertex); end
        edge = data(edgeRows(seed), :);
        if vertex ~= edge(2) && vertex ~= edge(3), error('Vertex %d has an invalid seed edge.', vertex); end
        vertexSeed(vertex) = seed;
    end
    for rowNumber = 1:size(faceTable, 1)
        face = faceTable(rowNumber, 1); seed = faceTable(rowNumber, 2);
        if isKey(faceSeed, face), error('Duplicate face %d.', face); end
        if ~isKey(edgeRows, seed), error('Face %d has a missing seed edge.', face); end
        edge = data(edgeRows(seed), :);
        if face ~= edge(4) && face ~= edge(5), error('Face %d has an invalid seed edge.', face); end
        faceSeed(face) = seed;
    end
    for rowNumber = 1:size(data, 1)
        if ~isKey(vertexSeed, data(rowNumber, 2)) || ~isKey(vertexSeed, data(rowNumber, 3)) || ...
                ~isKey(faceSeed, data(rowNumber, 4)) || ~isKey(faceSeed, data(rowNumber, 5))
            error('Edge %d refers to a missing vertex or face.', data(rowNumber, 1));
        end
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

function [count, cursor] = readCount(lines, cursor, label)
    if cursor > numel(lines), error('Missing Number of %s count.', label); end
    match = regexp(lines{cursor}, ['^Number of ' label '=([0-9]+)$'], 'tokens', 'once');
    if isempty(match), error('Invalid Number of %s count.', label); end
    count = str2double(match{1}); cursor = cursor + 1;
    if ~isfinite(count) || count < 1 || count ~= floor(count)
        error('Invalid Number of %s count.', label);
    end
end

function [data, cursor] = readTable(lines, cursor, header, count, width)
    if cursor > numel(lines) || ~strcmp(strrep(lines{cursor}, '"', ''), header)
        error('Expected the %s column labels.', header);
    end
    cursor = cursor + 1;
    data = zeros(count, width);
    for rowNumber = 1:count
        if cursor > numel(lines), error('Table has fewer than %d records.', count); end
        cells = strsplit(lines{cursor}, ',');
        if numel(cells) ~= width, error('Record %d needs %d columns.', rowNumber, width); end
        for column = 1:width
            value = strtrim(cells{column});
            if isempty(regexp(value, '^(0|[1-9][0-9]*)$', 'once'))
                error('Record %d must contain non-negative integer IDs.', rowNumber);
            end
            data(rowNumber, column) = str2double(value);
            if ~isfinite(data(rowNumber, column)) || data(rowNumber, column) ~= floor(data(rowNumber, column))
                error('Record %d has an invalid integer ID.', rowNumber);
            end
        end
        cursor = cursor + 1;
    end
end
