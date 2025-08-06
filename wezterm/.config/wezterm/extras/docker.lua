M = {
    docker_exec_domain = function(wezterm)
        local function get_docker_list()
            local docker_list = {}
            local success, stdout, stderr = wezterm.run_child_process {
                'docker',
                'container',
                'ls',
                '--format',
                '{{.ID}}:{{.Names}}',
            }
            for _, line in ipairs(wezterm.split_by_newlines(stdout)) do
                local id, name = line:match '(.-):(.+)'
                if id and name then
                    docker_list[id] = name
                end
            end
            return docker_list
        end

        local function make_docker_label_func(id)
            return function(name)
                local success, stdout, stderr = wezterm.run_child_process {
                    'docker',
                    'inspect',
                    '--format',
                    '{{.State.Running}}',
                    id,
                }
                local running = stdout == 'true\n'
                local color = running and 'Green' or 'Red'
                return wezterm.format {
                    { Foreground = { AnsiColor = color } },
                    { Text = 'docker container named ' .. name },
                }
            end
        end

        local function make_docker_fixup_func(id)
            return function(cmd)
                cmd.args = cmd.args or { '/bin/sh' }
                local wrapped = {
                    'docker',
                    'exec',
                    '-it',
                    id,
                }
                for _, arg in ipairs(cmd.args) do
                    table.insert(wrapped, arg)
                end

                cmd.args = wrapped
                return cmd
            end
        end

        local exec_domains = {}
        for id, name in pairs(get_docker_list()) do
            table.insert(
                exec_domains,
                wezterm.exec_domain(
                    'docker:' .. name,
                    make_docker_fixup_func(id),
                    make_docker_label_func(id)
                )
            )
        end
        return exec_domains
    end
}

return M
